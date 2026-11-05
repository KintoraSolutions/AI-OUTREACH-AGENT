import { describe, expect, it } from "vitest";
import {
  classifyFailure,
  describeFailureTotals,
  splitLoggedMessage,
  summarizeFailures,
  toOperatorMessage,
  type RawFailure,
} from "@/lib/research/failure-reasons";

/**
 * The four messages below are verbatim from a real run. They are the reason
 * this module exists, so they are the fixtures.
 */
const REAL = {
  pagespeed: "Elevate Physiotherapy: PageSpeed API error 400.",
  encoding:
    'Runway Health - London: Invalid `prisma.clinic.create()` invocation: Error occurred during query execution: ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "22P05", message: "character with byte sequence 0xf0 0x9f 0x93 0x9e in encoding \\"UTF8\\" has no equivalent in encoding \\"WIN1252\\"", severity: "ERROR", detail: None, column: None, hint: None }), transient: false })',
  noWebsite:
    "Physio and Athletic Conditioning Center: No website URL was available for this clinic.",
  captcha:
    "Physiohaus Health & Wellness - Physiotherapy in London Ontario: A CAPTCHA or bot wall was detected at physiohaus.ca; not bypassing.",
};

function raw(id: string, message: string, targetUrl: string | null = null): RawFailure {
  return { id, scope: "enrich", message, targetUrl };
}

describe("splitLoggedMessage", () => {
  it("recovers the clinic name the pipeline prefixes onto the message", () => {
    const { subject, detail } = splitLoggedMessage(REAL.noWebsite);
    expect(subject).toBe("Physio and Athletic Conditioning Center");
    expect(detail).toBe("No website URL was available for this clinic.");
  });

  it("leaves a message with no prefix alone", () => {
    const { subject, detail } = splitLoggedMessage("Discovery failed.");
    expect(subject).toBeNull();
    expect(detail).toBe("Discovery failed.");
  });

  it("does not treat a colon deep inside a stack trace as a name", () => {
    const long = `${"x".repeat(200)}: boom`;
    expect(splitLoggedMessage(long).subject).toBeNull();
  });
});

describe("classifyFailure on real messages", () => {
  it("reads a PageSpeed failure as a missing signal, not a lost lead", () => {
    // This clinic WAS saved. Reporting it as a failure made healthy runs look
    // broken, which is half of what the operator complained about.
    const r = classifyFailure(splitLoggedMessage(REAL.pagespeed).detail);
    expect(r.code).toBe("speed_test_unavailable");
    expect(r.impact).toBe("partial");
    expect(r.worthRetrying).toBe(true);
  });

  it("reads the Postgres encoding error as a lost lead", () => {
    // The clinic never reached the database. This is the only one of the four
    // that actually cost a lead.
    const r = classifyFailure(splitLoggedMessage(REAL.encoding).detail);
    expect(r.code).toBe("unsupported_characters");
    expect(r.impact).toBe("lead_lost");
    expect(r.explanation).not.toMatch(/prisma|ConnectorError|22P05/i);
  });

  it("reads a missing website as a saved-but-thin lead", () => {
    const r = classifyFailure(splitLoggedMessage(REAL.noWebsite).detail);
    expect(r.code).toBe("no_website");
    expect(r.impact).toBe("partial");
  });

  it("reads a bot wall as blocked, and not worth retrying", () => {
    const r = classifyFailure(splitLoggedMessage(REAL.captcha).detail);
    expect(r.code).toBe("bot_wall");
    expect(r.worthRetrying).toBe(false);
  });

  it("never leaks jargon into an explanation", () => {
    for (const message of Object.values(REAL)) {
      const r = classifyFailure(splitLoggedMessage(message).detail);
      expect(r.explanation).not.toMatch(/prisma|invocation|ConnectorError|stack|undefined|null/i);
      expect(r.label.length).toBeLessThan(60);
    }
  });
});

describe("classifyFailure ordering", () => {
  it("prefers the encoding match over the generic error wording around it", () => {
    // The encoding message also contains "error" and "execution"; order matters.
    expect(classifyFailure(REAL.encoding).code).toBe("unsupported_characters");
  });

  it("classifies the common network faults as unreachable", () => {
    for (const m of [
      "fetch failed: ETIMEDOUT",
      "connect ECONNREFUSED 10.0.0.1:443",
      "socket hang up",
      "getaddrinfo ENOTFOUND clinic.example",
      "Upstream returned 503",
    ]) {
      expect(classifyFailure(m).code).toBe("site_unreachable");
    }
  });

  it("separates 404 from 403", () => {
    expect(classifyFailure("Request failed with 404").code).toBe("not_found");
    expect(classifyFailure("Request failed with 403").code).toBe("access_denied");
  });

  it("classifies robots and rate limits", () => {
    expect(classifyFailure("Disallowed by robots.txt").code).toBe("robots_blocked");
    expect(classifyFailure("Received 429 Too Many Requests").code).toBe("rate_limited");
  });

  it("falls back to unknown rather than mislabelling", () => {
    const r = classifyFailure("something entirely unexpected happened");
    expect(r.code).toBe("unknown");
    expect(r.impact).toBe("lead_lost");
  });

  it("handles an empty message without throwing", () => {
    expect(classifyFailure("").code).toBe("unknown");
  });
});

describe("summarizeFailures", () => {
  const failures = [
    raw("1", REAL.pagespeed),
    raw("2", REAL.encoding),
    raw("3", REAL.noWebsite),
    raw("4", REAL.captcha),
    raw("5", "Another Clinic: No website URL was available for this clinic."),
  ];

  it("collapses five raw rows into four readable groups", () => {
    const groups = summarizeFailures(failures);
    expect(groups.map((g) => g.code).sort()).toEqual([
      "bot_wall",
      "no_website",
      "speed_test_unavailable",
      "unsupported_characters",
    ]);
  });

  it("puts lost leads before merely degraded ones", () => {
    expect(summarizeFailures(failures)[0]!.code).toBe("unsupported_characters");
  });

  it("counts repeats and collects the clinic names", () => {
    const group = summarizeFailures(failures).find((g) => g.code === "no_website")!;
    expect(group.count).toBe(2);
    expect(group.examples).toEqual([
      "Physio and Athletic Conditioning Center",
      "Another Clinic",
    ]);
  });

  it("keeps one raw sample so the real error is still recoverable", () => {
    const group = summarizeFailures(failures).find((g) => g.code === "unsupported_characters")!;
    expect(group.sample).toMatch(/22P05/);
  });

  it("does not repeat a clinic name within a group", () => {
    const dupes = [raw("1", "Same Clinic: 404"), raw("2", "Same Clinic: 404")];
    expect(summarizeFailures(dupes)[0]!.examples).toEqual(["Same Clinic"]);
  });

  it("returns nothing for an empty run", () => {
    expect(summarizeFailures([])).toEqual([]);
  });
});

describe("describeFailureTotals", () => {
  it("separates lost leads from degraded ones in the headline", () => {
    const groups = summarizeFailures([
      raw("1", REAL.encoding),
      raw("2", REAL.noWebsite),
      raw("3", REAL.captcha),
    ]);
    expect(describeFailureTotals(groups)).toBe("1 lead lost, 2 saved with gaps");
  });

  it("uses the singular correctly", () => {
    expect(describeFailureTotals(summarizeFailures([raw("1", REAL.encoding)]))).toBe("1 lead lost");
  });

  it("says so when nothing went wrong", () => {
    expect(describeFailureTotals([])).toBe("No issues");
  });
});

describe("toOperatorMessage", () => {
  it("keeps a message that already reads like prose", () => {
    // Replacing this with "A provider is not configured" would discard the one
    // detail that tells someone what to actually do.
    const configured = "Clinic discovery is not configured. Set GOOGLE_PLACES_API_KEY to enable it.";
    expect(toOperatorMessage(configured)).toBe(configured);
  });

  it("keeps short operational messages", () => {
    expect(toOperatorMessage("No new clinics matched the criteria.")).toBe(
      "No new clinics matched the criteria.",
    );
  });

  it("replaces a Prisma/driver error with its plain-language label", () => {
    expect(toOperatorMessage(REAL.encoding)).toBe(
      "Name contains characters the database cannot store",
    );
  });

  it("replaces anything carrying a stack frame", () => {
    const withFrame = "Boom\n    at src/lib/research/pipeline.ts:42";
    expect(toOperatorMessage(withFrame)).toBe("Could not be researched");
  });

  it("replaces an over-long single line", () => {
    expect(toOperatorMessage("timeout ".repeat(40))).toBe("Website did not respond");
  });

  it("handles empty input", () => {
    expect(toOperatorMessage("")).toBe("Could not be researched");
  });
});
