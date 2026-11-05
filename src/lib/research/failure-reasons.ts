/**
 * Plain-language reasons a lead could not be researched.
 *
 * The job list used to print the raw thrown message, which meant an operator
 * read things like `Invalid \`prisma.clinic.create()\` invocation: ConnectorError(
 * ConnectorError { kind: QueryError(PostgresError { code: "22P05" ... }) })`.
 * That says nothing about the lead and nothing about what to do.
 *
 * Classification happens at render time from the stored message rather than at
 * write time, so already-logged errors become readable too and no migration or
 * backfill is needed.
 *
 * The other thing this fixes: not every logged error is a lost lead. A failed
 * speed test still saves the clinic, with one missing signal. Grouping those
 * under the same heading as a lead that never made it into the database makes
 * a healthy run look broken.
 */

export type FailureCode =
  | "no_website"
  | "site_unreachable"
  | "bot_wall"
  | "robots_blocked"
  | "not_found"
  | "access_denied"
  | "unsafe_url"
  | "unsupported_content"
  | "speed_test_unavailable"
  | "rate_limited"
  | "unsupported_characters"
  | "provider_not_configured"
  | "unknown";

/**
 * What the failure cost you.
 *
 * - `lead_lost`   the clinic is not in your pipeline at all.
 * - `partial`     the clinic was saved, but with less evidence than usual, so
 *                 it will score lower than a fully-researched one.
 * - `skipped`     deliberately not researched; nothing went wrong.
 */
export type FailureImpact = "lead_lost" | "partial" | "skipped";

export interface FailureReason {
  code: FailureCode;
  /** Short label for grouping, e.g. "Site blocks automated visits". */
  label: string;
  /** One sentence an operator can act on. No jargon, no stack traces. */
  explanation: string;
  impact: FailureImpact;
  /** True when running research again could plausibly succeed. */
  worthRetrying: boolean;
}

const REASONS: Record<FailureCode, Omit<FailureReason, "code">> = {
  no_website: {
    label: "No website listed",
    explanation:
      "The directory has no website for this clinic, so there was nothing to audit. It is saved, but with little to score on.",
    impact: "partial",
    worthRetrying: false,
  },
  site_unreachable: {
    label: "Website did not respond",
    explanation:
      "The site was down, too slow, or refused the connection. Saved without website evidence — worth another run later.",
    impact: "partial",
    worthRetrying: true,
  },
  bot_wall: {
    label: "Site blocks automated visits",
    explanation:
      "A CAPTCHA or bot wall sits in front of the site. We do not bypass those, so this clinic is saved without website evidence.",
    impact: "partial",
    worthRetrying: false,
  },
  robots_blocked: {
    label: "Site asks not to be crawled",
    explanation:
      "The site's robots.txt disallows automated access and we respect it. Saved without website evidence.",
    impact: "partial",
    worthRetrying: false,
  },
  not_found: {
    label: "Website address is dead",
    explanation:
      "The listed address returned Not Found. The clinic may have moved domains. Saved without website evidence.",
    impact: "partial",
    worthRetrying: false,
  },
  access_denied: {
    label: "Website requires a login",
    explanation:
      "The site refused access without credentials. Saved without website evidence.",
    impact: "partial",
    worthRetrying: false,
  },
  unsafe_url: {
    label: "Address was not safe to open",
    explanation:
      "The listed address pointed somewhere private or malformed, so it was not fetched. Saved without website evidence.",
    impact: "partial",
    worthRetrying: false,
  },
  unsupported_content: {
    label: "Website is not a readable page",
    explanation:
      "The address returned a file rather than a web page. Saved without website evidence.",
    impact: "partial",
    worthRetrying: false,
  },
  speed_test_unavailable: {
    label: "Speed test unavailable",
    explanation:
      "The page-speed service could not score this site. Everything else was collected; only the performance signal is missing.",
    impact: "partial",
    worthRetrying: true,
  },
  rate_limited: {
    label: "Hit a provider rate limit",
    explanation: "A provider throttled the run. Running research again usually clears this.",
    impact: "lead_lost",
    worthRetrying: true,
  },
  unsupported_characters: {
    label: "Name contains characters the database cannot store",
    explanation:
      "This clinic's details include an emoji or non-Latin character, and the database was created with WIN1252 encoding, which cannot hold them. The lead was dropped.",
    impact: "lead_lost",
    worthRetrying: false,
  },
  provider_not_configured: {
    label: "A provider is not configured",
    explanation: "A required API key is missing, so this step could not run.",
    impact: "lead_lost",
    worthRetrying: false,
  },
  unknown: {
    label: "Could not be researched",
    explanation: "An unexpected problem stopped this clinic. The technical detail is kept below.",
    impact: "lead_lost",
    worthRetrying: true,
  },
};

/**
 * Ordered most-specific first. A Postgres encoding failure also contains the
 * word "error", so the cheap substring checks have to run in a deliberate order
 * rather than whichever matches first by accident.
 */
const MATCHERS: { code: FailureCode; test: RegExp }[] = [
  // Encoding: the message names the encoding and the offending byte sequence.
  { code: "unsupported_characters", test: /has no equivalent in encoding|22P05|WIN1252/i },
  { code: "no_website", test: /no website url was available|no website on record/i },
  { code: "bot_wall", test: /captcha|bot wall|cloudflare challenge|are you a robot/i },
  { code: "robots_blocked", test: /robots\.txt|robots disallow|disallowed by robots/i },
  { code: "not_found", test: /\b404\b|\b410\b|not found/i },
  { code: "access_denied", test: /\b401\b|\b403\b|forbidden|unauthorized|login wall|requires? a login/i },
  { code: "unsafe_url", test: /unsafe url|ssrf|private address|invalid url|not a public/i },
  { code: "unsupported_content", test: /unsupported content|not html|content[- ]type/i },
  { code: "speed_test_unavailable", test: /pagespeed|lighthouse|performance api/i },
  { code: "rate_limited", test: /\b429\b|rate limit|too many requests|quota/i },
  { code: "provider_not_configured", test: /is not configured\.? set |not configured/i },
  {
    code: "site_unreachable",
    // ETIMEDOUT and ESOCKETTIMEDOUT are listed explicitly: neither contains
    // "timeout" or "timed out" as a substring.
    test: /timeout|timed out|etimedout|esockettimedout|eai_again|econnrefused|econnreset|enotfound|dns|network error|socket hang up|\b5\d\d\b|unreachable/i,
  },
];

/** Classify one raw error message into a reason an operator can act on. */
export function classifyFailure(message: string): FailureReason {
  const text = message ?? "";
  for (const { code, test } of MATCHERS) {
    if (test.test(text)) return { code, ...REASONS[code] };
  }
  return { code: "unknown", ...REASONS.unknown };
}

/** Look up a reason directly, for callers that already know the code. */
export function reasonFor(code: FailureCode): FailureReason {
  return { code, ...REASONS[code] };
}

export interface RawFailure {
  id: string;
  scope: string;
  message: string;
  targetUrl: string | null;
}

export interface FailureGroup {
  code: FailureCode;
  label: string;
  explanation: string;
  impact: FailureImpact;
  worthRetrying: boolean;
  count: number;
  /** Clinic names, where the message carried one. Capped for rendering. */
  examples: string[];
  /** One raw message, kept so a developer can still see the real error. */
  sample: string;
}

/** Clinic names are logged as `"<name>: <message>"`; recover the name. */
export function splitLoggedMessage(message: string): { subject: string | null; detail: string } {
  const at = message.indexOf(": ");
  if (at <= 0 || at > 120) return { subject: null, detail: message };
  return { subject: message.slice(0, at), detail: message.slice(at + 2) };
}

const MAX_EXAMPLES = 6;

/**
 * Collapse a job's raw error rows into a handful of readable groups, ordered by
 * severity then frequency — lost leads first, because those are the ones that
 * cost you something.
 */
export function summarizeFailures(failures: RawFailure[]): FailureGroup[] {
  const groups = new Map<FailureCode, FailureGroup>();

  for (const failure of failures) {
    const { subject, detail } = splitLoggedMessage(failure.message);
    const reason = classifyFailure(detail);
    const existing = groups.get(reason.code);

    if (existing) {
      existing.count += 1;
      if (subject && existing.examples.length < MAX_EXAMPLES && !existing.examples.includes(subject)) {
        existing.examples.push(subject);
      }
    } else {
      groups.set(reason.code, {
        ...reason,
        count: 1,
        examples: subject ? [subject] : [],
        sample: detail,
      });
    }
  }

  const severity: Record<FailureImpact, number> = { lead_lost: 0, partial: 1, skipped: 2 };
  return [...groups.values()].sort(
    (a, b) => severity[a.impact] - severity[b.impact] || b.count - a.count,
  );
}

/** Headline for the collapsed summary, e.g. "2 leads lost, 12 saved with gaps". */
export function describeFailureTotals(groups: FailureGroup[]): string {
  const lost = groups.filter((g) => g.impact === "lead_lost").reduce((n, g) => n + g.count, 0);
  const partial = groups.filter((g) => g.impact === "partial").reduce((n, g) => n + g.count, 0);

  const parts: string[] = [];
  if (lost > 0) parts.push(`${lost} lead${lost === 1 ? "" : "s"} lost`);
  if (partial > 0) parts.push(`${partial} saved with gaps`);
  if (parts.length === 0) return "No issues";
  return parts.join(", ");
}

/**
 * Markers that a message was written for a developer, not an operator.
 * Backticks and braces come from Prisma/driver errors; "at <file>:<line>" from
 * stack frames; a very long single line is almost always a serialized object.
 */
const TECHNICAL = /[`{}]|\bat [\w./\-]+:\d+|invocation|ConnectorError|Error:\s|\bundefined\b/;

/**
 * The message an operator should see for a failure.
 *
 * Not every thrown message needs replacing — "Clinic discovery is not
 * configured. Set GOOGLE_PLACES_API_KEY to enable it." is already better than
 * any generic label, and classifying it would throw away the one detail that
 * matters. So a message that already reads like prose is kept, and only
 * developer-shaped text is swapped for its plain-language reason.
 */
export function toOperatorMessage(raw: string): string {
  const text = (raw ?? "").trim();
  if (!text) return reasonFor("unknown").label;
  if (text.length <= 160 && !TECHNICAL.test(text)) return text;
  return classifyFailure(text).label;
}
