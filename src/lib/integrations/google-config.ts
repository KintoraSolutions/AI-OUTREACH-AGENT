import { GoogleNotConfiguredError } from "@/lib/integrations/errors";

/**
 * Google OAuth client configuration, derived from environment variables. The
 * same OAuth client (GOOGLE_CLIENT_ID/SECRET) that powers sign-in is reused for
 * incremental Gmail/Calendar authorization. No secrets are ever sent to the
 * client; this module runs server-side only.
 */

/** Path Google redirects back to after consent. Must be registered in GCP. */
export const GOOGLE_REDIRECT_PATH = "/api/integrations/google/callback";

export interface GoogleOAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function isGoogleOAuthConfigured(): boolean {
  return (
    typeof process.env.GOOGLE_CLIENT_ID === "string" &&
    process.env.GOOGLE_CLIENT_ID.trim().length > 0 &&
    typeof process.env.GOOGLE_CLIENT_SECRET === "string" &&
    process.env.GOOGLE_CLIENT_SECRET.trim().length > 0
  );
}

/** Resolve the app's base URL (for building an absolute redirect_uri). */
export function resolveBaseUrl(requestOrigin?: string): string {
  const fromEnv = process.env.NEXTAUTH_URL?.trim();
  const base = fromEnv || requestOrigin || "http://localhost:3000";
  return base.replace(/\/$/, "");
}

/**
 * Build the OAuth client config. `requestOrigin` (from the incoming request) is
 * used only when NEXTAUTH_URL is unset, so production uses the configured URL.
 */
export function getOAuthClientConfig(requestOrigin?: string): GoogleOAuthClientConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new GoogleNotConfiguredError();
  return {
    clientId,
    clientSecret,
    redirectUri: `${resolveBaseUrl(requestOrigin)}${GOOGLE_REDIRECT_PATH}`,
  };
}
