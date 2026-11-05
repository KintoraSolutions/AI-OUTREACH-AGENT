import { describe, expect, it } from "vitest";
import { buildCrumbs, dynamicCrumbKey } from "@/lib/nav/breadcrumbs";

/**
 * `buildCrumbs` is pure on purpose so it can be tested without a router. These
 * lock in the two rules that are easy to regress: the last crumb never links to
 * the page you are already on, and a dynamic segment never prints a raw cuid.
 */
describe("buildCrumbs", () => {
  it("returns a single crumb for the dashboard, which callers treat as no trail", () => {
    expect(buildCrumbs("/dashboard")).toEqual([{ label: "Dashboard" }]);
  });

  it("never gives the last crumb an href", () => {
    const paths = [
      "/leads",
      "/leads/new",
      "/leads/abc123",
      "/leads/abc123/edit",
      "/campaigns",
      "/campaigns/xyz789",
      "/campaigns/xyz789/review",
      "/jobs",
      "/settings",
      "/review",
      "/tutorial",
      "/help",
      "/help/how-scoring-works",
    ];
    for (const path of paths) {
      const crumbs = buildCrumbs(path);
      expect(crumbs.length).toBeGreaterThan(0);
      expect(crumbs[crumbs.length - 1]!.href).toBeUndefined();
    }
  });

  it("always starts at the dashboard outside the dashboard itself", () => {
    for (const path of ["/leads", "/review", "/settings", "/help/your-ai"]) {
      expect(buildCrumbs(path)[0]).toEqual({ label: "Dashboard", href: "/dashboard" });
    }
  });

  it("labels the review queue", () => {
    expect(buildCrumbs("/review")).toEqual([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Review drafts" },
    ]);
  });

  it("ignores query strings and hashes, which the queue relies on", () => {
    expect(buildCrumbs("/review?bucket=approved&id=abc")).toEqual(buildCrumbs("/review"));
    expect(buildCrumbs("/leads#top")).toEqual(buildCrumbs("/leads"));
  });

  it("uses a generic noun rather than printing a record id", () => {
    expect(buildCrumbs("/leads/ckxyz0001abcd")).toEqual([
      { label: "Dashboard", href: "/dashboard" },
      { label: "Leads", href: "/leads" },
      { label: "Lead" },
    ]);
  });

  it("uses the override when the page supplies its title", () => {
    const crumbs = buildCrumbs("/leads/ckxyz0001abcd", { lead: "Forest City Optometry" });
    expect(crumbs[2]).toEqual({ label: "Forest City Optometry" });
  });

  it("treats reserved segments as pages, not record ids", () => {
    expect(buildCrumbs("/leads/new")[2]).toEqual({ label: "New lead" });
    expect(buildCrumbs("/leads/import")[2]).toEqual({ label: "Import" });
    expect(buildCrumbs("/campaigns/new")[2]).toEqual({ label: "New campaign" });
  });

  it("keeps the campaign crumb linked on the pre-launch review route", () => {
    const crumbs = buildCrumbs("/campaigns/abc/review", { campaign: "Q4 optometry" });
    expect(crumbs[2]).toEqual({ label: "Q4 optometry", href: "/campaigns/abc" });
    expect(crumbs[3]).toEqual({ label: "Review" });
  });

  it("does not claim the campaign title slot on the review route", () => {
    // The review page's own title is "Review and launch", which is not the
    // campaign's name — using it for the campaign crumb would mislabel it.
    expect(dynamicCrumbKey("/campaigns/abc/review")).toBeNull();
  });

  it("keeps the clinic crumb linked on a nested edit route", () => {
    const crumbs = buildCrumbs("/leads/abc/edit", { lead: "Riverside Dental" });
    expect(crumbs[2]).toEqual({ label: "Riverside Dental", href: "/leads/abc" });
    expect(crumbs[3]).toEqual({ label: "Edit" });
  });

  it("titleizes an unknown route instead of rendering nothing", () => {
    const crumbs = buildCrumbs("/some-new-area");
    expect(crumbs[1]).toEqual({ label: "Some new area" });
  });
});

describe("dynamicCrumbKey", () => {
  it("claims the slot only when the dynamic segment is last", () => {
    expect(dynamicCrumbKey("/leads/abc")).toBe("lead");
    expect(dynamicCrumbKey("/campaigns/abc")).toBe("campaign");
    expect(dynamicCrumbKey("/help/why-drafts-get-blocked")).toBe("help");
  });

  it("does not claim the lead slot on /leads/[id]/edit", () => {
    // That page's title is "Edit <clinic>", which labels the edit crumb — using
    // it for the clinic crumb would print the wrong name.
    expect(dynamicCrumbKey("/leads/abc/edit")).toBeNull();
  });

  it("does not claim a slot for reserved segments or static routes", () => {
    expect(dynamicCrumbKey("/leads/new")).toBeNull();
    expect(dynamicCrumbKey("/leads/import")).toBeNull();
    expect(dynamicCrumbKey("/campaigns/new")).toBeNull();
    expect(dynamicCrumbKey("/review")).toBeNull();
    expect(dynamicCrumbKey("/settings")).toBeNull();
  });
});
