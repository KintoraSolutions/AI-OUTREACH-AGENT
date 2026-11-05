/**
 * Least-privilege Google OAuth scopes (docs/planning/build-plan.md S9, S10).
 *
 * We request ONLY what each capability needs:
 *  - Gmail: `gmail.compose` — create drafts. NOT `gmail.send` / `gmail.modify`.
 *  - Calendar: `calendar.events` — manage events we create. NOT full calendar.
 *  - Identity: `openid email profile` — to label which account is connected.
 *
 * Scopes are granted incrementally: connecting Gmail does not force Calendar, and
 * `include_granted_scopes=true` preserves previously granted scopes.
 */

export const GMAIL_COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
export const IDENTITY_SCOPES = ["openid", "email", "profile"] as const;

export type GoogleCapability = "gmail" | "calendar";

/** Resolve the minimal scope set for the requested capabilities. */
export function scopesForCapabilities(capabilities: GoogleCapability[]): string[] {
  const scopes = new Set<string>(IDENTITY_SCOPES);
  if (capabilities.includes("gmail")) scopes.add(GMAIL_COMPOSE_SCOPE);
  if (capabilities.includes("calendar")) scopes.add(CALENDAR_EVENTS_SCOPE);
  return [...scopes];
}

export function hasGmailScope(scopes: string[]): boolean {
  return scopes.includes(GMAIL_COMPOSE_SCOPE);
}

export function hasCalendarScope(scopes: string[]): boolean {
  return scopes.includes(CALENDAR_EVENTS_SCOPE);
}

/** Which capabilities a granted scope list actually authorizes. */
export function capabilitiesFromScopes(scopes: string[]): GoogleCapability[] {
  const caps: GoogleCapability[] = [];
  if (hasGmailScope(scopes)) caps.push("gmail");
  if (hasCalendarScope(scopes)) caps.push("calendar");
  return caps;
}
