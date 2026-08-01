/**
 * Typed integration errors so callers can distinguish a configuration problem
 * (surface a "connect / configure" message) from a not-connected state (prompt
 * the user to connect Google) from a transient API failure (retry / show error).
 * None of these ever carry token material in their message.
 */

/** Thrown when TOKEN_ENCRYPTION_KEY is missing or not a valid 32-byte base64 key. */
export class TokenEncryptionNotConfiguredError extends Error {
  constructor(
    message = "Token encryption is not configured. Set TOKEN_ENCRYPTION_KEY to a base64-encoded 32-byte key.",
  ) {
    super(message);
    this.name = "TokenEncryptionNotConfiguredError";
  }
}

/** Thrown when the Google OAuth client (client id/secret) is not configured. */
export class GoogleNotConfiguredError extends Error {
  constructor(
    message = "Google integration is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
  ) {
    super(message);
    this.name = "GoogleNotConfiguredError";
  }
}

/** Thrown when there is no usable (connected, non-revoked) Google account. */
export class GoogleNotConnectedError extends Error {
  constructor(message = "No connected Google account is available. Connect one in Settings.") {
    super(message);
    this.name = "GoogleNotConnectedError";
  }
}

/** Thrown when OAuth state validation or a token exchange/refresh fails. */
export class GoogleAuthError extends Error {
  /** True when Google reported `invalid_grant` (revoked/expired refresh token). */
  readonly invalidGrant: boolean;
  constructor(message: string, opts: { invalidGrant?: boolean } = {}) {
    super(message);
    this.name = "GoogleAuthError";
    this.invalidGrant = opts.invalidGrant ?? false;
  }
}

/** Thrown when a Gmail/Calendar API call fails. */
export class GoogleApiError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}
