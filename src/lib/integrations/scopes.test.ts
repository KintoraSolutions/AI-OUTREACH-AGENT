import { describe, expect, it } from "vitest";
import {
  scopesForCapabilities,
  capabilitiesFromScopes,
  hasGmailScope,
  hasCalendarScope,
  GMAIL_COMPOSE_SCOPE,
  CALENDAR_EVENTS_SCOPE,
} from "@/lib/integrations/scopes";

describe("least-privilege scopes", () => {
  it("gmail capability requests only gmail.compose + identity", () => {
    const s = scopesForCapabilities(["gmail"]);
    expect(s).toContain(GMAIL_COMPOSE_SCOPE);
    expect(s).toContain("openid");
    expect(s).not.toContain(CALENDAR_EVENTS_SCOPE);
    // Never over-broad.
    expect(s.some((x) => x.includes("gmail.send") || x.includes("gmail.modify") || x.includes("mail.google.com"))).toBe(false);
  });

  it("calendar capability requests only calendar.events + identity", () => {
    const s = scopesForCapabilities(["calendar"]);
    expect(s).toContain(CALENDAR_EVENTS_SCOPE);
    expect(s).not.toContain(GMAIL_COMPOSE_SCOPE);
    expect(s.some((x) => x === "https://www.googleapis.com/auth/calendar")).toBe(false);
  });

  it("both capabilities request both scopes, no duplicates", () => {
    const s = scopesForCapabilities(["gmail", "calendar"]);
    expect(new Set(s).size).toBe(s.length);
    expect(hasGmailScope(s)).toBe(true);
    expect(hasCalendarScope(s)).toBe(true);
  });

  it("maps granted scopes back to capabilities", () => {
    expect(capabilitiesFromScopes([GMAIL_COMPOSE_SCOPE])).toEqual(["gmail"]);
    expect(capabilitiesFromScopes([CALENDAR_EVENTS_SCOPE])).toEqual(["calendar"]);
    expect(capabilitiesFromScopes([GMAIL_COMPOSE_SCOPE, CALENDAR_EVENTS_SCOPE])).toEqual(["gmail", "calendar"]);
    expect(capabilitiesFromScopes(["openid", "email"])).toEqual([]);
  });
});
