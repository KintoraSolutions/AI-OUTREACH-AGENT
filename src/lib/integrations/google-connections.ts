import type { GoogleConnection } from "@prisma/client";
import { IntegrationEventType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/integrations/crypto";
import { revokeToken, decodeIdToken, type GoogleTokenResponse } from "@/lib/integrations/google-oauth";
import { decryptSecret } from "@/lib/integrations/crypto";
import { capabilitiesFromScopes, type GoogleCapability } from "@/lib/integrations/scopes";
import { logIntegrationActivity } from "@/lib/integrations/activity";

/**
 * Persistence + lookups for per-user Google connections. Token columns are only
 * ever read by server-side token/API helpers; the `toPublicConnection` mapper is
 * the ONLY shape exposed to the UI and it never includes token material.
 */

export interface PublicGoogleConnection {
  id: string;
  userId: string;
  accountEmail: string | null;
  scopes: string[];
  capabilities: GoogleCapability[];
  isDefaultSender: boolean;
  revoked: boolean;
  expiresAt: string | null;
  connectedAt: string;
  isMine: boolean;
}

export function toPublicConnection(
  c: GoogleConnection,
  currentUserId: string,
): PublicGoogleConnection {
  return {
    id: c.id,
    userId: c.userId,
    accountEmail: c.accountEmail,
    scopes: c.scopes,
    capabilities: capabilitiesFromScopes(c.scopes),
    isDefaultSender: c.isDefaultSender,
    revoked: c.revokedAt != null,
    expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
    connectedAt: c.connectedAt.toISOString(),
    isMine: c.userId === currentUserId,
  };
}

/** The signed-in user's own connection within the org (may be revoked). */
export function getConnectionForUser(orgId: string, userId: string) {
  return prisma.googleConnection.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
}

/** The org's authorized default-sender connection, if any (non-revoked). */
export function getDefaultSenderConnection(orgId: string) {
  return prisma.googleConnection.findFirst({
    where: { orgId, isDefaultSender: true, revokedAt: null },
  });
}

/**
 * Pick a connection usable for `capability`: prefer the user's own active
 * connection with the needed scope, else fall back to the org default sender if
 * it has the scope. Returns null when neither qualifies.
 */
export async function getUsableConnection(
  orgId: string,
  userId: string,
  capability: GoogleCapability,
): Promise<GoogleConnection | null> {
  const wants = (c: GoogleConnection | null) =>
    !!c && c.revokedAt == null && capabilitiesFromScopes(c.scopes).includes(capability);

  const own = await getConnectionForUser(orgId, userId);
  if (wants(own)) return own;

  const fallback = await getDefaultSenderConnection(orgId);
  if (wants(fallback)) return fallback;

  return null;
}

export async function listOrgConnections(orgId: string): Promise<GoogleConnection[]> {
  return prisma.googleConnection.findMany({
    where: { orgId },
    orderBy: { connectedAt: "asc" },
  });
}

/**
 * Upsert the connecting user's connection from a fresh token response. Merges
 * newly granted scopes with any previously granted ones (incremental auth) and
 * preserves the existing refresh token when Google omits one on re-consent.
 */
export async function saveConnectionFromTokens(input: {
  orgId: string;
  userId: string;
  tokens: GoogleTokenResponse;
}): Promise<{ connection: GoogleConnection; reconnected: boolean }> {
  const { orgId, userId, tokens } = input;
  const idInfo = tokens.id_token ? decodeIdToken(tokens.id_token) : {};
  const grantedScopes = tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : [];
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  const existing = await prisma.googleConnection.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });

  const mergedScopes = [...new Set([...(existing?.scopes ?? []), ...grantedScopes])];
  const refreshTokenEnc = tokens.refresh_token
    ? encryptSecret(tokens.refresh_token)
    : existing?.refreshTokenEnc ?? null;

  const connection = await prisma.googleConnection.upsert({
    where: { orgId_userId: { orgId, userId } },
    create: {
      orgId,
      userId,
      googleSub: idInfo.sub ?? null,
      accountEmail: idInfo.email ?? null,
      scopes: mergedScopes,
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc,
      expiresAt,
      connectedById: userId,
      revokedAt: null,
    },
    update: {
      googleSub: idInfo.sub ?? existing?.googleSub ?? null,
      accountEmail: idInfo.email ?? existing?.accountEmail ?? null,
      scopes: mergedScopes,
      accessTokenEnc: encryptSecret(tokens.access_token),
      refreshTokenEnc,
      expiresAt,
      revokedAt: null,
    },
  });

  return { connection, reconnected: existing != null };
}

/**
 * Disconnect a user's connection: best-effort revoke at Google, then delete the
 * stored tokens. Returns false if there was nothing to disconnect.
 */
export async function disconnectConnection(
  orgId: string,
  userId: string,
  fetchImpl = fetch,
): Promise<boolean> {
  const existing = await prisma.googleConnection.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!existing) return false;

  // Revoke the refresh token upstream (best-effort), then remove local tokens.
  if (existing.refreshTokenEnc) {
    try {
      await revokeToken(decryptSecret(existing.refreshTokenEnc), fetchImpl);
    } catch {
      // Ignore: the local connection is removed regardless.
    }
  }
  await prisma.googleConnection.delete({ where: { id: existing.id } });

  await logIntegrationActivity({
    orgId,
    userId,
    type: IntegrationEventType.GOOGLE_DISCONNECTED,
    provider: "google",
    summary: `Disconnected Google account${existing.accountEmail ? ` (${existing.accountEmail})` : ""}.`,
    metadata: { connectionId: existing.id },
  });
  return true;
}

/**
 * Mark one connection as the org's authorized default sender (clears the flag on
 * all others in the org). Only an active, non-revoked connection may be default.
 */
export async function setDefaultSender(orgId: string, connectionId: string): Promise<boolean> {
  const target = await prisma.googleConnection.findFirst({
    where: { id: connectionId, orgId, revokedAt: null },
  });
  if (!target) return false;

  await prisma.$transaction([
    prisma.googleConnection.updateMany({
      where: { orgId, isDefaultSender: true },
      data: { isDefaultSender: false },
    }),
    prisma.googleConnection.update({
      where: { id: connectionId },
      data: { isDefaultSender: true },
    }),
  ]);

  await logIntegrationActivity({
    orgId,
    userId: target.userId,
    type: IntegrationEventType.GOOGLE_DEFAULT_SENDER_SET,
    provider: "google",
    summary: `Set default sender to ${target.accountEmail ?? "a connected account"}.`,
    metadata: { connectionId },
  });
  return true;
}
