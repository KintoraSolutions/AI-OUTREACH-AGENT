import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "@/lib/integrations/crypto";
import { GoogleAuthError } from "@/lib/integrations/errors";
import type { GoogleOAuthClientConfig } from "@/lib/integrations/google-config";
import type { GoogleCapability } from "@/lib/integrations/scopes";

/**
 * Google OAuth 2.0 protocol helpers (authorization URL, code exchange, refresh,
 * revoke, id_token decode, and signed anti-CSRF state). All network calls go
 * through an injectable `fetch`, so tests exercise the exact request shapes and
 * error handling without hitting Google.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export type FetchLike = typeof fetch;

export interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token?: string;
}

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

export function buildAuthUrl(
  cfg: GoogleOAuthClientConfig,
  opts: {
    scopes: string[];
    state: string;
    /**
     * Pre-highlights an account in the chooser. Only a hint — `select_account`
     * still shows the full list, so this never traps someone on one account.
     */
    loginHint?: string | null;
  },
): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: opts.scopes.join(" "),
    // `consent` so Google issues a refresh token even on re-consent, and
    // `select_account` so the account chooser always appears. Without the
    // latter, someone already signed into a personal Gmail in that browser is
    // silently reconnected to it — which makes connecting a company Workspace
    // account look impossible rather than merely hidden.
    access_type: "offline",
    prompt: "consent select_account",
    // Incremental authorization: keep any previously granted scopes.
    include_granted_scopes: "true",
    state: opts.state,
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange / refresh / revoke
// ---------------------------------------------------------------------------

async function postToken(
  body: URLSearchParams,
  fetchImpl: FetchLike,
): Promise<GoogleTokenResponse> {
  const res = await fetchImpl(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    const invalidGrant = /invalid_grant/i.test(text);
    throw new GoogleAuthError(
      `Google token request failed (${res.status}).`,
      { invalidGrant },
    );
  }
  try {
    return JSON.parse(text) as GoogleTokenResponse;
  } catch {
    throw new GoogleAuthError("Google returned an unparseable token response.");
  }
}

export function exchangeCodeForTokens(
  code: string,
  cfg: GoogleOAuthClientConfig,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokenResponse> {
  return postToken(
    new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
    fetchImpl,
  );
}

export function refreshAccessToken(
  refreshToken: string,
  cfg: Pick<GoogleOAuthClientConfig, "clientId" | "clientSecret">,
  fetchImpl: FetchLike = fetch,
): Promise<GoogleTokenResponse> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
    }),
    fetchImpl,
  );
}

/** Best-effort token revocation. A revoked/expired token is treated as success. */
export async function revokeToken(token: string, fetchImpl: FetchLike = fetch): Promise<void> {
  try {
    await fetchImpl(REVOKE_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token }).toString(),
    });
  } catch {
    // Revocation is best-effort; the local connection is removed regardless.
  }
}

/**
 * Decode the id_token payload WITHOUT signature verification. It is used only to
 * label the connected account (email + stable `sub`). We trust it because it was
 * just returned directly by Google's token endpoint over TLS; it is never used
 * for authorization decisions.
 */
export function decodeIdToken(idToken: string): { email?: string; sub?: string } {
  const parts = idToken.split(".");
  if (parts.length < 2) return {};
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8"));
    return {
      email: typeof payload.email === "string" ? payload.email : undefined,
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Signed anti-CSRF state
// ---------------------------------------------------------------------------

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthStatePayload {
  nonce: string;
  capabilities: GoogleCapability[];
  returnTo?: string;
  ts: number;
}

function stateSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new GoogleAuthError("AUTH_SECRET is required to sign OAuth state.");
  return secret;
}

/** Create a signed, time-stamped state value bound to a fresh nonce. */
export function createSignedState(input: {
  capabilities: GoogleCapability[];
  returnTo?: string;
  now?: number;
}): string {
  const payload: OAuthStatePayload = {
    nonce: randomBytes(16).toString("base64url"),
    capabilities: input.capabilities,
    returnTo: input.returnTo,
    ts: input.now ?? Date.now(),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * Validate a returned state value against the one stored in the httpOnly cookie.
 * Enforces (1) exact match with the cookie (CSRF binding), (2) a valid HMAC
 * signature (tamper-evidence), and (3) freshness. Returns the parsed payload.
 */
export function verifySignedState(
  value: string | undefined | null,
  cookieValue: string | undefined | null,
  now: number = Date.now(),
): OAuthStatePayload {
  if (!value || !cookieValue) throw new GoogleAuthError("Missing OAuth state.");
  if (!safeEqual(value, cookieValue)) throw new GoogleAuthError("OAuth state does not match.");

  const [body, sig] = value.split(".");
  if (!body || !sig) throw new GoogleAuthError("Malformed OAuth state.");
  const expected = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) throw new GoogleAuthError("OAuth state signature is invalid.");

  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    throw new GoogleAuthError("OAuth state payload is unreadable.");
  }
  if (typeof payload.ts !== "number" || now - payload.ts > STATE_TTL_MS) {
    throw new GoogleAuthError("OAuth state has expired. Please try connecting again.");
  }
  return payload;
}
