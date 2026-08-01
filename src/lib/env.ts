import { z } from "zod";

/**
 * Environment access and the provider registry.
 *
 * Per plan.md Section 2B (decision 6): the app never fabricates results when a
 * provider's credentials are missing. Instead it reports which providers are
 * configured and disables the dependent functionality with a clear message.
 *
 * Env vars are read leniently here (all optional) so the app can boot for the
 * parts that are configured; `providerStatus()` is the source of truth for what
 * is available.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  AUTH_SECRET: z.string().optional(),
  NEXTAUTH_URL: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  AUTH_DEV_LOGIN: z.string().optional(),

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
  JOB_RUNNER: z.enum(["inline", "inngest"]).optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  EMAIL_VERIFIER: z.string().optional(),
  EMAIL_VERIFIER_API_KEY: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);

const has = (v: string | undefined) => typeof v === "string" && v.trim().length > 0;

export const isDevLoginEnabled =
  env.NODE_ENV !== "production" && env.AUTH_DEV_LOGIN === "true";

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
