import type { GoogleConnection } from "@prisma/client";
import { IntegrationEventType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/integrations/crypto";
import { GoogleNotConnectedError, GoogleAuthError } from "@/lib/integrations/errors";
import { getOAuthClientConfig } from "@/lib/integrations/google-config";
import { refreshAccessToken, type FetchLike } from "@/lib/integrations/google-oauth";
import { logIntegrationActivity } from "@/lib/integrations/activity";

/**
 * Return a valid (non-expired) access token for a connection, transparently
 * refreshing it when needed. The refreshed access token (and any rotated refresh
 * token) is re-encrypted and persisted. A revoked/expired refresh token
 * (`invalid_grant`) marks the connection revoked and raises
 * GoogleNotConnectedError so the UI can prompt a reconnect. The plaintext token
 * is returned to the caller for a single API call and never logged or stored in
 * the clear.
 */
const EXPIRY_SKEW_MS = 60_000;

export async function getValidAccessToken(
  connection: GoogleConnection,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  if (connection.revokedAt) {
    throw new GoogleNotConnectedError("This Google connection was disconnected. Reconnect it in Settings.");
  }

  const stillValid =
    connection.accessTokenEnc &&
    connection.expiresAt &&
    connection.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (stillValid) {
    return decryptSecret(connection.accessTokenEnc!);
  }

  if (!connection.refreshTokenEnc) {
    throw new GoogleNotConnectedError("No refresh token stored. Reconnect the Google account.");
  }

  const cfg = getOAuthClientConfig();
  const refreshToken = decryptSecret(connection.refreshTokenEnc);

  let tokens;
  try {
    tokens = await refreshAccessToken(refreshToken, cfg, fetchImpl);
  } catch (error) {
    if (error instanceof GoogleAuthError && error.invalidGrant) {
      await prisma.googleConnection.update({
        where: { id: connection.id },
        data: { revokedAt: new Date() },
      });
      await logIntegrationActivity({
        orgId: connection.orgId,
        userId: connection.userId,
        type: IntegrationEventType.GOOGLE_DISCONNECTED,
        provider: "google",
        summary: "Google access was revoked upstream; connection marked disconnected.",
        metadata: { connectionId: connection.id, reason: "invalid_grant" },
      });
      throw new GoogleNotConnectedError("Google access was revoked. Reconnect the account in Settings.");
    }
    throw error;
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await prisma.googleConnection.update({
    where: { id: connection.id },
    data: {
      accessTokenEnc: encryptSecret(tokens.access_token),
      // Google may rotate the refresh token; persist a new one if provided.
      refreshTokenEnc: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token)
        : connection.refreshTokenEnc,
      expiresAt,
    },
  });
  await logIntegrationActivity({
    orgId: connection.orgId,
    userId: connection.userId,
    type: IntegrationEventType.GOOGLE_TOKEN_REFRESHED,
    provider: "google",
    summary: "Refreshed Google access token.",
    metadata: { connectionId: connection.id },
  });

  return tokens.access_token;
}
