import { beforeAll, describe, expect, it, vi } from "vitest";
import { GoogleAuthError } from "@/lib/integrations/errors";
import {
  buildAuthUrl,
  createSignedState,
  verifySignedState,
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeToken,
  decodeIdToken,
} from "@/lib/integrations/google-oauth";
import { scopesForCapabilities } from "@/lib/integrations/scopes";

const CFG = {
  clientId: "client-123.apps.googleusercontent.com",
  clientSecret: "secret",
  redirectUri: "https://app.example/api/integrations/google/callback",
};

beforeAll(() => {
  process.env.AUTH_SECRET = "test-auth-secret-for-state-signing";
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

describe("buildAuthUrl", () => {
  it("requests offline access, forces consent, and enables incremental auth", () => {
    const url = new URL(
      buildAuthUrl(CFG, { scopes: scopesForCapabilities(["gmail"]), state: "st" }),
    );
    const p = url.searchParams;
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(p.get("access_type")).toBe("offline");
    // `consent` issues the refresh token; `select_account` is asserted in the
    // account-selection block below.
    expect((p.get("prompt") ?? "").split(" ")).toContain("consent");
    expect(p.get("include_granted_scopes")).toBe("true");
    expect(p.get("response_type")).toBe("code");
    expect(p.get("redirect_uri")).toBe(CFG.redirectUri);
    expect(p.get("state")).toBe("st");
    // Least-privilege: gmail.compose present, no send/modify/full-calendar.
    const scope = p.get("scope") ?? "";
    expect(scope).toContain("gmail.compose");
    expect(scope).not.toContain("gmail.send");
    expect(scope).not.toContain("gmail.modify");
    expect(scope).not.toContain("calendar.events");
  });
});

describe("signed OAuth state", () => {
  it("verifies a matching, fresh, correctly-signed state", () => {
    const state = createSignedState({ capabilities: ["gmail"], now: 1000 });
    const payload = verifySignedState(state, state, 1000 + 5000);
    expect(payload.capabilities).toEqual(["gmail"]);
  });

  it("rejects a state that does not match the cookie (CSRF)", () => {
    const a = createSignedState({ capabilities: ["gmail"] });
    const b = createSignedState({ capabilities: ["gmail"] });
    expect(() => verifySignedState(a, b)).toThrow(GoogleAuthError);
  });

  it("rejects a tampered signature", () => {
    const state = createSignedState({ capabilities: ["gmail"] });
    const tampered = state.slice(0, -2) + (state.endsWith("aa") ? "bb" : "aa");
    expect(() => verifySignedState(tampered, tampered)).toThrow(GoogleAuthError);
  });

  it("rejects an expired state", () => {
    const state = createSignedState({ capabilities: ["gmail"], now: 0 });
    expect(() => verifySignedState(state, state, 11 * 60 * 1000)).toThrow(/expired/i);
  });

  it("rejects a missing state or cookie", () => {
    expect(() => verifySignedState(undefined, "x")).toThrow(GoogleAuthError);
    expect(() => verifySignedState("x", undefined)).toThrow(GoogleAuthError);
  });
});

describe("token exchange / refresh / revoke", () => {
  it("exchanges an auth code for tokens", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "openid", token_type: "Bearer" }),
    );
    const tokens = await exchangeCodeForTokens("code", CFG, fetchImpl as unknown as typeof fetch);
    expect(tokens.access_token).toBe("at");
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init!.method).toBe("POST");
    expect(String(init!.body)).toContain("grant_type=authorization_code");
  });

  it("flags invalid_grant on refresh (revoked/expired refresh token)", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ error: "invalid_grant" }, false, 400),
    );
    await expect(
      refreshAccessToken("rt", CFG, fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ name: "GoogleAuthError", invalidGrant: true });
  });

  it("refreshes an access token", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () =>
      jsonResponse({ access_token: "at2", expires_in: 3600, scope: "openid", token_type: "Bearer" }),
    );
    const tokens = await refreshAccessToken("rt", CFG, fetchImpl as unknown as typeof fetch);
    expect(tokens.access_token).toBe("at2");
    expect(String(fetchImpl.mock.calls[0]![1]!.body)).toContain("grant_type=refresh_token");
  });

  it("revokes best-effort without throwing", async () => {
    const fetchImpl = vi.fn<FetchFn>(async () => jsonResponse({}, true));
    await expect(revokeToken("rt", fetchImpl as unknown as typeof fetch)).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls[0]![0]).toContain("revoke");
  });
});

describe("decodeIdToken", () => {
  it("extracts email and sub from a JWT payload", () => {
    const payload = Buffer.from(JSON.stringify({ email: "a@b.com", sub: "123" })).toString("base64url");
    const info = decodeIdToken(`header.${payload}.sig`);
    expect(info).toEqual({ email: "a@b.com", sub: "123" });
  });

  it("returns empty for a malformed token", () => {
    expect(decodeIdToken("not-a-jwt")).toEqual({});
  });
});

describe("buildAuthUrl — account selection", () => {
  it("always asks Google to show the account chooser", () => {
    // Without select_account, a browser already signed into a personal Gmail
    // reconnects to it silently and a company Workspace account cannot be
    // chosen at all.
    const url = new URL(buildAuthUrl(CFG, { scopes: ["a"], state: "st" }));
    const prompt = url.searchParams.get("prompt") ?? "";
    expect(prompt.split(" ")).toContain("select_account");
  });

  it("still asks for consent, which is what issues the refresh token", () => {
    const url = new URL(buildAuthUrl(CFG, { scopes: ["a"], state: "st" }));
    expect((url.searchParams.get("prompt") ?? "").split(" ")).toContain("consent");
    expect(url.searchParams.get("access_type")).toBe("offline");
  });

  it("passes a login hint without it preventing another choice", () => {
    const url = new URL(
      buildAuthUrl(CFG, { scopes: ["a"], state: "st", loginHint: "me@personal.example" }),
    );
    expect(url.searchParams.get("login_hint")).toBe("me@personal.example");
    expect((url.searchParams.get("prompt") ?? "").split(" ")).toContain("select_account");
  });

  it("omits the hint entirely when there is none", () => {
    const url = new URL(buildAuthUrl(CFG, { scopes: ["a"], state: "st", loginHint: null }));
    expect(url.searchParams.has("login_hint")).toBe(false);
  });
});
