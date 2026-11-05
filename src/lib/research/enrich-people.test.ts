import { describe, expect, it } from "vitest";
import { Confidence, DecisionRole } from "@prisma/client";
import { enrichClinic } from "@/lib/research/enrich";
import { NonRecoverableError } from "@/lib/research/errors";
import type {
  DiscoveredClinic,
  FetchResult,
  PerformanceProvider,
  ProviderBundle,
  WebsiteFetcher,
} from "@/lib/research/types";

/**
 * The decision-maker path, end to end through enrichment.
 *
 * The headline assertion is that `contact_decision_maker_email` fires. That
 * rule has existed in `rules.ts` since the scoring engine was written and had
 * never once produced a point, because `enrich.ts` passed a hardcoded
 * `hasDecisionMakerEmail: false`. These tests are what stop it reverting to
 * dead code.
 */

const HOME = `
  <html><body>
    <h1>Riverbend Family Optometry</h1>
    <nav><a href="/our-team">Our Team</a></nav>
    <a href="mailto:info@riverbend.example">info@riverbend.example</a>
  </body></html>`;

const TEAM = `
  <html><body>
    <h2>Dr. Sarah Chen</h2>
    <p>Founder &amp; Medical Director</p>
    <a href="mailto:s.chen@riverbend.example">Email</a>

    <h2>Dr. Michael O'Brien</h2>
    <p>Optometrist</p>

    <h2>Jenna Wallace</h2>
    <p>Receptionist</p>
    <a href="mailto:reception@riverbend.example">Email</a>
  </body></html>`;

class PlanFetcher implements WebsiteFetcher {
  readonly name = "plan";
  readonly calls: string[] = [];
  constructor(private readonly plan: Record<string, string | Error>) {}
  async fetch(url: string): Promise<FetchResult> {
    this.calls.push(url);
    const entry = this.plan[new URL(url).pathname];
    if (entry === undefined) throw new NonRecoverableError("not_found", `no plan for ${url}`);
    if (entry instanceof Error) throw entry;
    return { finalUrl: url, status: 200, contentType: "text/html", html: entry };
  }
}

const noPerformance: PerformanceProvider = {
  name: "none",
  isConfigured: () => false,
  audit: async () => {
    throw new Error("not configured");
  },
};

function bundle(fetcher: WebsiteFetcher): Pick<ProviderBundle, "fetcher" | "performance" | "browser"> {
  return { fetcher, performance: noPerformance, browser: null } as unknown as Pick<
    ProviderBundle,
    "fetcher" | "performance" | "browser"
  >;
}

const CANDIDATE: DiscoveredClinic = {
  name: "Riverbend Family Optometry",
  websiteUrl: "https://riverbend.example/",
  mainPhone: "+1 519 555 0142",
  address: "448 Oxford St E, London, ON",
  category: "Optometry",
  locationCount: 1,
  externalId: "sample",
  sourceUrl: "https://maps.example/?cid=sample",
  keywordsHaystack: "optometry",
};

async function run(plan: Record<string, string | Error>) {
  const fetcher = new PlanFetcher(plan);
  const result = await enrichClinic(CANDIDATE, "dedupe-1", bundle(fetcher), { retries: 0 });
  return { result, fetcher };
}

describe("enrichClinic, people", () => {
  it("follows the team page linked from the homepage", async () => {
    const { fetcher } = await run({ "/": HOME, "/our-team": TEAM });
    expect(fetcher.calls).toContain("https://riverbend.example/our-team");
  });

  it("records the decision makers and skips front-desk staff", async () => {
    const { result } = await run({ "/": HOME, "/our-team": TEAM });
    const names = result.people.map((p) => p.fullName);
    expect(names).toContain("Sarah Chen");
    expect(names).toContain("Michael O'Brien");
    // The receptionist publishes an address, which is exactly why she must be
    // excluded by role rather than by whether a mailto was present.
    expect(names).not.toContain("Jenna Wallace");
  });

  it("classifies the owner and keeps her published address", async () => {
    const { result } = await run({ "/": HOME, "/our-team": TEAM });
    const chen = result.people.find((p) => p.fullName === "Sarah Chen");
    expect(chen?.classification?.role).toBe(DecisionRole.OWNER);
    expect(chen?.classification?.confidence).toBe(Confidence.VERIFIED);
    expect(chen?.email).toBe("s.chen@riverbend.example");
  });

  it("fires contact_decision_maker_email, which was previously unreachable", async () => {
    const { result } = await run({ "/": HOME, "/our-team": TEAM });
    const finding = result.findings.find((f) => f.code === "contact_decision_maker_email");
    expect(finding).toBeDefined();
    expect(finding?.confidence).toBe(Confidence.VERIFIED);
  });

  it("does not fire it for an associate physician with no stated authority", async () => {
    const associateOnly = `
      <html><body>
        <h2>Dr. Michael O'Brien</h2>
        <p>Optometrist</p>
        <a href="mailto:m.obrien@riverbend.example">Email</a>
      </body></html>`;
    const { result } = await run({ "/": HOME, "/our-team": associateOnly });

    expect(result.people.find((p) => p.fullName === "Michael O'Brien")?.email).toBe(
      "m.obrien@riverbend.example",
    );
    // Having an address is not having authority. The rule requires VERIFIED.
    expect(result.findings.some((f) => f.code === "contact_decision_maker_email")).toBe(false);
  });

  it("does not fire it when the owner published no address", async () => {
    const noAddress = `<html><body><h2>Dr. Sarah Chen</h2><p>Owner</p></body></html>`;
    const { result } = await run({ "/": HOME, "/our-team": noAddress });

    expect(result.people.find((p) => p.fullName === "Sarah Chen")?.classification?.role).toBe(
      DecisionRole.OWNER,
    );
    expect(result.findings.some((f) => f.code === "contact_decision_maker_email")).toBe(false);
  });

  it("keeps the lead when the team page cannot be fetched", async () => {
    const { result } = await run({
      "/": HOME,
      "/our-team": new NonRecoverableError("robots_disallow", "disallowed by robots"),
    });

    // A team page we may not read costs us the people on it, never the lead.
    expect(result.people).toEqual([]);
    expect(result.dedupeKey).toBe("dedupe-1");
    expect(result.softErrors.some((e) => e.targetUrl?.includes("/our-team"))).toBe(true);
    expect(result.findings.length).toBeGreaterThan(0);
  });

  it("behaves exactly as before for a clinic with no team page", async () => {
    const plain = `<html><body><h1>Riverbend</h1><p>Call us.</p></body></html>`;
    const { result } = await run({ "/": plain });
    expect(result.people).toEqual([]);
    expect(result.findings.some((f) => f.code === "contact_decision_maker_email")).toBe(false);
  });
});
