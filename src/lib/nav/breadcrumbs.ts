/**
 * Route -> breadcrumb trail.
 *
 * Kept as a pure function (no React, no `usePathname`) so the mapping can be
 * unit tested and so the shell stays a thin renderer. Dynamic segments (a lead
 * id, a campaign id, a help slug) cannot be labelled from the URL alone, so the
 * caller passes a human label through `overrides`; without one we fall back to
 * a generic noun rather than printing a cuid at the user.
 */

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Override slots. One per dynamic route family; `dynamicCrumbKey` tells the
 * caller which slot (if any) the current pathname is asking for.
 */
export type CrumbOverrideKey = "lead" | "campaign" | "help";

export type CrumbOverrides = Partial<Record<CrumbOverrideKey, string>> &
  Record<string, string | undefined>;

const DASHBOARD_LINK: Crumb = { label: "Dashboard", href: "/dashboard" };

/** Segments under /leads and /campaigns that are pages, not record ids. */
const LEAD_RESERVED = new Set(["new", "import"]);
const CAMPAIGN_RESERVED = new Set(["new"]);

/** "how-scoring-works" -> "How scoring works". */
function titleize(segment: string): string {
  const cleaned = decodeURIComponent(segment).replace(/[-_]+/g, " ").trim();
  if (!cleaned) return segment;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function segmentsOf(pathname: string): string[] {
  const path = pathname.split("?")[0]?.split("#")[0] ?? "";
  return path.split("/").filter(Boolean);
}

/**
 * Which override slot the CURRENT page can fill from its own title, or null.
 *
 * Only returned when the dynamic segment is the LAST one: on `/leads/[id]/edit`
 * the page title is "Edit Riverside Dental", which is the label for the *edit*
 * crumb, not for the clinic crumb, so we would otherwise print the wrong name.
 */
export function dynamicCrumbKey(pathname: string): CrumbOverrideKey | null {
  const segments = segmentsOf(pathname);
  if (segments.length !== 2) return null;
  const [first, second] = segments;
  if (!second) return null;
  if (first === "leads" && !LEAD_RESERVED.has(second)) return "lead";
  if (first === "campaigns" && !CAMPAIGN_RESERVED.has(second)) return "campaign";
  if (first === "help") return "help";
  return null;
}

function leadsTrail(segments: string[], overrides: CrumbOverrides): Crumb[] {
  const id = segments[1];
  if (!id) return [{ label: "Leads" }];
  if (id === "new") return [{ label: "Leads", href: "/leads" }, { label: "New lead" }];
  if (id === "import") return [{ label: "Leads", href: "/leads" }, { label: "Import" }];

  const name = overrides.lead ?? "Lead";
  if (segments[2] === "edit") {
    return [
      { label: "Leads", href: "/leads" },
      { label: name, href: `/leads/${id}` },
      { label: "Edit" },
    ];
  }
  return [{ label: "Leads", href: "/leads" }, { label: name }];
}

function campaignsTrail(segments: string[], overrides: CrumbOverrides): Crumb[] {
  const id = segments[1];
  if (!id) return [{ label: "Campaigns" }];
  if (id === "new") {
    return [{ label: "Campaigns", href: "/campaigns" }, { label: "New campaign" }];
  }

  const campaign = overrides.campaign ?? "Campaign";
  // /campaigns/[id]/review keeps the campaign crumb linked, so the pre-launch
  // review has a way back to the campaign it belongs to.
  if (segments[2] === "review") {
    return [
      { label: "Campaigns", href: "/campaigns" },
      { label: campaign, href: `/campaigns/${id}` },
      { label: "Review" },
    ];
  }

  return [{ label: "Campaigns", href: "/campaigns" }, { label: campaign }];
}

function helpTrail(segments: string[], overrides: CrumbOverrides): Crumb[] {
  const slug = segments[1];
  if (!slug) return [{ label: "Help" }];
  return [
    { label: "Help", href: "/help" },
    { label: overrides.help ?? titleize(slug) },
  ];
}

/** Unknown routes still get a usable trail instead of nothing. */
function genericTrail(segments: string[]): Crumb[] {
  return segments.map((segment, i) => ({
    label: titleize(segment),
    href: i === segments.length - 1 ? undefined : `/${segments.slice(0, i + 1).join("/")}`,
  }));
}

/**
 * Build the trail for a pathname. The first crumb is always Dashboard; the last
 * crumb never carries an href (you are already there).
 *
 * `/dashboard` returns a single crumb, which callers treat as "no trail" — one
 * crumb is noise, not navigation.
 */
export function buildCrumbs(pathname: string, overrides: CrumbOverrides = {}): Crumb[] {
  const segments = segmentsOf(pathname);
  const first = segments[0];

  if (!first || first === "dashboard") return [{ label: "Dashboard" }];

  switch (first) {
    case "leads":
      return [DASHBOARD_LINK, ...leadsTrail(segments, overrides)];
    case "campaigns":
      return [DASHBOARD_LINK, ...campaignsTrail(segments, overrides)];
    case "help":
      return [DASHBOARD_LINK, ...helpTrail(segments, overrides)];
    case "jobs":
      return [DASHBOARD_LINK, { label: "Jobs" }];
    case "review":
      return [DASHBOARD_LINK, { label: "Review drafts" }];
    case "settings":
      return [DASHBOARD_LINK, { label: "Settings" }];
    case "tutorial":
      return [DASHBOARD_LINK, { label: "Tutorial" }];
    default:
      return [DASHBOARD_LINK, ...genericTrail(segments)];
  }
}
