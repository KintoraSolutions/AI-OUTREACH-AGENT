import { NextResponse, type NextRequest } from "next/server";
import { IntegrationEventType } from "@prisma/client";
import { getOrgContext } from "@/lib/auth/rbac";
import { getOAuthClientConfig } from "@/lib/integrations/google-config";
import { exchangeCodeForTokens, verifySignedState } from "@/lib/integrations/google-oauth";
import { saveConnectionFromTokens } from "@/lib/integrations/google-connections";
import { logIntegrationActivity } from "@/lib/integrations/activity";
import { GoogleAuthError } from "@/lib/integrations/errors";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";

/**
 * Google OAuth callback. Validates the signed state against the httpOnly cookie
 * (CSRF), exchanges the code for tokens, and stores an encrypted per-user
 * connection. Tokens are never written to logs or returned to the client.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const settings = new URL("/settings", origin);
  const ctx = await getOrgContext();

  const clearState = (res: NextResponse) => {
    res.cookies.set(STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  };

  if (!ctx) {
    const signin = new URL("/signin", origin);
    signin.searchParams.set("callbackUrl", "/settings");
    return NextResponse.redirect(signin);
  }

  const params = req.nextUrl.searchParams;
  const denied = params.get("error");
  if (denied) {
    settings.searchParams.set("error", "google_denied");
    return clearState(NextResponse.redirect(settings));
  }

  const code = params.get("code");
  const state = params.get("state");
  const cookieState = req.cookies.get(STATE_COOKIE)?.value ?? null;

  try {
    // 1. Anti-CSRF: state must match the cookie, be signed, and be fresh.
    const payload = verifySignedState(state, cookieState);
    if (!code) throw new GoogleAuthError("Missing authorization code.");

    // 2. Exchange the code for tokens.
    const cfg = getOAuthClientConfig(origin);
    const tokens = await exchangeCodeForTokens(code, cfg);

    // 3. Persist an encrypted, per-user connection (scopes merged incrementally).
    const { connection, reconnected } = await saveConnectionFromTokens({
      orgId: ctx.orgId,
      userId: ctx.userId,
      tokens,
    });

    await logIntegrationActivity({
      orgId: ctx.orgId,
      userId: ctx.userId,
      type: reconnected
        ? IntegrationEventType.GOOGLE_RECONNECTED
        : IntegrationEventType.GOOGLE_CONNECTED,
      provider: "google",
      summary: `Connected Google account${connection.accountEmail ? ` (${connection.accountEmail})` : ""} for ${payload.capabilities.join(", ")}.`,
      metadata: {
        connectionId: connection.id,
        capabilities: payload.capabilities,
        scopes: connection.scopes,
      },
    });

    settings.searchParams.set("connected", "google");
    return clearState(NextResponse.redirect(settings));
  } catch (error) {
    // Record the failure for the immutable integration log; never log tokens.
    await logIntegrationActivity({
      orgId: ctx.orgId,
      userId: ctx.userId,
      type: IntegrationEventType.INTEGRATION_ERROR,
      provider: "google",
      summary: "Google connection failed during the OAuth callback.",
      metadata: { reason: error instanceof Error ? error.name : "unknown" },
    }).catch(() => {});
    settings.searchParams.set("error", "google_connect_failed");
    return clearState(NextResponse.redirect(settings));
  }
}
