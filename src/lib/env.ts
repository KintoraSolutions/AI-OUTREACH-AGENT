import { z } from "zod";

/**
 * Environment access and the provider registry.
 *
 * Per docs/planning/build-plan.md Section 2B (decision 6): the app never fabricates results when a
 * provider's credentials are missing. Instead it reports which providers are
 * configured and disables the dependent functionality with a clear message.
 *
 * Env vars are read leniently here (all optional) so the app can boot for the
 * parts that are configured; `providerStatus()` is the source of truth for what
 * is available.
 */
/**
 * An optional enum that also accepts an empty string.
 *
 * `.optional()` only forgives `undefined`, so a variable that is PRESENT but
 * blank — exactly what copying `.env.example` produces — fails the parse and,
 * because this module is imported by middleware, 500s the entire app before any
 * route runs.
 */
const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(values as unknown as [string, ...string[]]).optional(),
    // The cast above widens the inferred output, so the union is restored here;
    // callers still get `"inline" | "inngest" | undefined`, not `string`.
  ) as unknown as z.ZodType<T[number] | undefined>;

const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().optional(),
  // Tolerant on purpose. This module is parsed at import time and pulled in
  // by middleware, so a value Zod rejects takes down every request before a
  // page can render. `.default` covers an unset variable; `.catch` covers an
  // unexpected one like "staging" and resolves it to production, so an
  // unrecognised environment never re-arms a development-only bypass.
  NODE_ENV: z.enum(["development", "test", "production"]).default("development").catch("production"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  AUTH_DEV_LOGIN: z.string().optional(),
  /** Comma-separated sign-in allowlist. See `signInAllowList` below. */
  AUTH_ALLOWED_EMAILS: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  // Optional AI tuning (parsed as numbers where used; sensible defaults apply).
  AI_TIMEOUT_MS: z.string().optional(),
  AI_MAX_RETRIES: z.string().optional(),
  AI_MAX_OUTPUT_TOKENS: z.string().optional(),
  // Delay between clinics in a bulk drafting job (AI rate limiting).
  DRAFT_BULK_DELAY_MS: z.string().optional(),
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  PAGESPEED_API_KEY: z.string().optional(),
  BROWSER_PROVIDER: z.string().optional(),
  BROWSERLESS_API_KEY: z.string().optional(),
  CLOUDFLARE_BROWSER_TOKEN: z.string().optional(),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  // Local-only override to force a specific job runner. Ignored in production,
  // where Inngest is required and the inline runner is never used.
  JOB_RUNNER: optionalEnum(["inline", "inngest"]),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  EMAIL_VERIFIER: z.string().optional(),
  EMAIL_VERIFIER_API_KEY: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);

const has = (v: string | undefined) => typeof v === "string" && v.trim().length > 0;

/**
 * Password-less sign-in as any existing user. Development only.
 *
 * Previously gated on `NODE_ENV !== "production"`, which is permissive in the
 * wrong direction: anything that is not exactly the string "production" — a
 * blank variable, "prod", a container that never sets it — re-armed a bypass
 * that hands out the owner's session to anyone who can load /signin. Requiring
 * "development" explicitly means an unrecognised environment fails closed.
 */
export const isDevLoginEnabled =
  env.NODE_ENV === "development" && env.AUTH_DEV_LOGIN === "true";

/**
 * Environment variables without which production cannot work at all.
 *
 * Both are declared optional above so the app can boot half-configured in
 * development, which means a production deployment missing either one starts
 * up looking healthy and then fails on every request: Auth.js throws
 * MissingSecret without AUTH_SECRET, and Prisma throws at module init without
 * DATABASE_URL. Checking here converts that into one legible failure.
 */
/**
 * Email addresses permitted to sign in, lowercased. Empty means "no explicit
 * allowlist", which production treats as "existing users only".
 */
export const signInAllowList: string[] = (env.AUTH_ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function productionEnvProblems(): string[] {
  if (env.NODE_ENV !== "production") return [];
  const problems: string[] = [];
  if (!has(env.AUTH_SECRET)) {
    problems.push("AUTH_SECRET is not set — nobody can sign in. Generate one with `npx auth secret`.");
  }
  if (!has(env.DATABASE_URL)) {
    problems.push("DATABASE_URL is not set — every page will fail when Prisma initialises.");
  }
  return problems;
}

// Fail loudly at boot rather than per-request. Skipped during `next build`,
// where these are legitimately absent on some hosts and nothing serves traffic.
if (env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  const problems = productionEnvProblems();
  if (problems.length > 0) {
    const bullets = problems.map((p) => "  - " + p).join("\n");
    throw new Error("Cannot start in production:\n" + bullets);
  }
}

export type ProviderKey =
  | "auth_google"
  | "ai"
  | "discovery"
  | "performance"
  | "browser"
  | "email_verification"
  | "background_jobs"
  | "storage"
  | "google_integrations";

export interface ProviderInfo {
  key: ProviderKey;
  label: string;
  configured: boolean;
  phase: string;
  /** What is unavailable while this provider is not configured. */
  unavailable: string;
  requiredEnv: string[];
}

/**
 * Single source of truth for provider availability, surfaced in the Settings
 * "System status" panel and used to disable dependent actions.
 */
export function providerStatus(): ProviderInfo[] {
  const browserConfigured =
    (env.BROWSER_PROVIDER === "browserless" && has(env.BROWSERLESS_API_KEY)) ||
    (env.BROWSER_PROVIDER === "cloudflare" && has(env.CLOUDFLARE_BROWSER_TOKEN)) ||
    env.BROWSER_PROVIDER === "playwright-local";

  return [
    {
      key: "auth_google",
      label: "Google sign-in",
      configured: has(env.GOOGLE_CLIENT_ID) && has(env.GOOGLE_CLIENT_SECRET),
      phase: "Phase 2",
      unavailable: "Signing in with Google (a development-only sign-in is used until configured).",
      requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    },
    {
      key: "discovery",
      label: "Clinic discovery (Google Places)",
      configured: has(env.GOOGLE_PLACES_API_KEY),
      phase: "Phase 3",
      unavailable: "Automated clinic discovery. Manual entry and CSV import still work.",
      requiredEnv: ["GOOGLE_PLACES_API_KEY"],
    },
    {
      key: "performance",
      label: "Website performance (PageSpeed)",
      configured: has(env.PAGESPEED_API_KEY),
      phase: "Phase 3",
      unavailable: "Automated performance auditing of clinic websites.",
      requiredEnv: ["PAGESPEED_API_KEY"],
    },
    {
      key: "browser",
      label: "Headless browser",
      configured: browserConfigured,
      phase: "Deferred",
      unavailable:
        "Website screenshots, rendered mobile audits, and console-error inspection.",
      requiredEnv: ["BROWSER_PROVIDER", "BROWSERLESS_API_KEY / CLOUDFLARE_BROWSER_TOKEN"],
    },
    {
      key: "ai",
      label: "AI drafting (Anthropic)",
      configured: has(env.ANTHROPIC_API_KEY),
      phase: "Phase 4",
      unavailable: "AI service recommendation and email-draft generation.",
      requiredEnv: ["ANTHROPIC_API_KEY"],
    },
    {
      key: "google_integrations",
      label: "Gmail & Calendar (Google)",
      configured:
        has(env.GOOGLE_CLIENT_ID) &&
        has(env.GOOGLE_CLIENT_SECRET) &&
        has(env.TOKEN_ENCRYPTION_KEY),
      phase: "Phase 6",
      unavailable:
        "Creating Gmail drafts from approved emails and syncing follow-ups to Google Calendar. Requires OAuth credentials and a token-encryption key.",
      requiredEnv: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"],
    },
    {
      key: "background_jobs",
      label: "Background jobs (Inngest)",
      configured: has(env.INNGEST_EVENT_KEY) && has(env.INNGEST_SIGNING_KEY),
      phase: "Phase 3",
      unavailable:
        "Durable, retried background research (Inngest). Required in production; in local development the in-process runner is used instead.",
      requiredEnv: ["INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY"],
    },
    {
      key: "storage",
      label: "Blob storage",
      configured: has(env.BLOB_READ_WRITE_TOKEN),
      phase: "Deferred",
      unavailable: "Storing website screenshots (needed once a browser provider is enabled).",
      requiredEnv: ["BLOB_READ_WRITE_TOKEN"],
    },
    {
      key: "email_verification",
      label: "Email verification",
      configured: env.EMAIL_VERIFIER !== "none" && has(env.EMAIL_VERIFIER_API_KEY),
      phase: "Optional",
      unavailable: "Verifying contact email deliverability. Contacts remain UNVERIFIED.",
      requiredEnv: ["EMAIL_VERIFIER", "EMAIL_VERIFIER_API_KEY"],
    },
  ];
}

export function isProviderConfigured(key: ProviderKey): boolean {
  return providerStatus().find((p) => p.key === key)?.configured ?? false;
}
