import { NextResponse, type NextRequest } from "next/server";
import { getOrgContext } from "@/lib/auth/rbac";
import { isTokenEncryptionConfigured } from "@/lib/integrations/crypto";
import { getOAuthClientConfig, isGoogleOAuthConfigured } from "@/lib/integrations/google-config";
import { buildAuthUrl, createSignedState } from "@/lib/integrations/google-oauth";
import { scopesForCapabilities, type GoogleCapability } from "@/lib/integrations/scopes";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "g_oauth_state";

/**
 * Start Google incremental authorization. Requires a signed-in user, a
 * configured OAuth client, and a configured token-encryption key. Sets a signed,
 * httpOnly state cookie (CSRF protection) and redirects to Google's consent
 * screen requesting only the least-privilege scopes for the chosen capability.
 */
export async function GET(req: NextRequest) {
  const ctx = await getOrgContext();
  const origin = req.nextUrl.origin;
  const settings = new URL("/settings", origin);

  if (!ctx) {
    const signin = new URL("/signin", origin);
    signin.searchParams.set("callbackUrl", "/settings");
    return NextResponse.redirect(signin);
  }
  if (!isGoogleOAuthConfigured()) {
    settings.searchParams.set("error", "google_not_configured");
    return NextResponse.redirect(settings);
  }
  if (!isTokenEncryptionConfigured()) {
    settings.searchParams.set("error", "token_encryption_not_configured");
    return NextResponse.redirect(settings);
  }

  // Which capability(ies) to request. Default to both; least-privilege scopes.
  const raw = (req.nextUrl.searchParams.get("capability") ?? "gmail,calendar")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is GoogleCapability => s === "gmail" || s === "calendar");
  const capabilities: GoogleCapability[] = raw.length > 0 ? [...new Set(raw)] : ["gmail", "calendar"];

  const cfg = getOAuthClientConfig(origin);
  const state = createSignedState({ capabilities, returnTo: "/settings" });
  const url = buildAuthUrl(cfg, {
    scopes: scopesForCapabilities(capabilities),
    state,
    loginHint: ctx.userEmail,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
