import { describe, expect, it } from "vitest";
import {
  ARTICLES,
  HELP_SECTIONS,
  articlesInSection,
  getArticle,
  headingId,
  searchArticles,
  sectionNeighbours,
  type Block,
  type SectionKey,
} from "@/lib/help/content";

/**
 * Structural guarantees for the help content. Pure: no Prisma, no React, no
 * network. These are the invariants other agents' code depends on — every
 * `HelpTip` slug and every in-app deep link resolves to a real article, and no
 * article links to one that does not exist.
 */

/**
 * Slugs that other parts of the app link to directly. Removing or renaming one
 * of these breaks a link somewhere else, so the list is duplicated here on
 * purpose rather than derived from ARTICLES.
 */
const REQUIRED_SLUGS = [
  "getting-started",
  "your-ai",
  "adding-leads",
  "csv-import",
  "campaigns-and-research",
  "how-scoring-works",
  "findings-and-confidence",
  "generating-drafts",
  "evidence-and-claims",
  "why-drafts-get-blocked",
  "review-warnings",
  "approving-and-gmail",
  "follow-ups",
  "settings-overview",
  "roles-and-permissions",
  "troubleshooting",
] as const;

const SECTION_KEYS = new Set<string>(HELP_SECTIONS.map((s) => s.key));

function blockText(block: Block): string {
  switch (block.kind) {
    case "para":
    case "note":
    case "warning":
    case "heading":
      return block.text;
    case "steps":
    case "bullets":
      return block.items.join(" ");
    case "table":
      return [...block.head, ...block.rows.flat()].join(" ");
    case "terms":
      return block.items.map((t) => `${t.term} ${t.definition}`).join(" ");
  }
}

describe("help article structure", () => {
  it("has a unique slug for every article", () => {
    const slugs = ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("contains every slug the rest of the app links to", () => {
    const slugs = new Set(ARTICLES.map((a) => a.slug));
    for (const required of REQUIRED_SLUGS) {
      expect(slugs.has(required), `missing required article: ${required}`).toBe(true);
    }
  });

  it("gives every article a title, a non-empty summary and at least 3 blocks", () => {
    for (const a of ARTICLES) {
      expect(a.title.trim().length, `${a.slug} has no title`).toBeGreaterThan(0);
      expect(a.summary.trim().length, `${a.slug} has no summary`).toBeGreaterThan(0);
      expect(a.blocks.length, `${a.slug} has too few blocks`).toBeGreaterThanOrEqual(3);
    }
  });

  it("puts every article in a real section", () => {
    for (const a of ARTICLES) {
      expect(SECTION_KEYS.has(a.section), `${a.slug} has unknown section ${a.section}`).toBe(true);
    }
  });

  it("resolves every related-article reference", () => {
    for (const a of ARTICLES) {
      for (const related of a.related ?? []) {
        expect(getArticle(related), `${a.slug} links to missing article ${related}`).not.toBeNull();
        expect(related, `${a.slug} lists itself as related`).not.toBe(a.slug);
      }
    }
  });

  it("never leaves a block empty", () => {
    for (const a of ARTICLES) {
      for (const [i, b] of a.blocks.entries()) {
        expect(blockText(b).trim().length, `${a.slug} block ${i} is empty`).toBeGreaterThan(0);
        if (b.kind === "steps" || b.kind === "bullets") {
          expect(b.items.length, `${a.slug} block ${i} has no items`).toBeGreaterThan(0);
        }
        if (b.kind === "table") {
          expect(b.rows.length, `${a.slug} block ${i} has no rows`).toBeGreaterThan(0);
          for (const row of b.rows) {
            expect(row.length, `${a.slug} block ${i} row width mismatch`).toBe(b.head.length);
          }
        }
        if (b.kind === "terms") {
          expect(b.items.length, `${a.slug} block ${i} has no terms`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("gives every heading in an article a distinct anchor id", () => {
    for (const a of ARTICLES) {
      const ids = a.blocks.filter((b) => b.kind === "heading").map((b) => headingId(b.text));
      expect(new Set(ids).size, `${a.slug} has duplicate heading ids`).toBe(ids.length);
    }
  });

  it("gives every article searchable keywords", () => {
    for (const a of ARTICLES) {
      expect(a.keywords.length, `${a.slug} has no keywords`).toBeGreaterThan(0);
    }
  });
});

describe("getArticle", () => {
  it("returns the article for a known slug", () => {
    expect(getArticle("how-scoring-works")?.title).toBeTruthy();
  });

  it("returns null for an unknown slug", () => {
    expect(getArticle("no-such-article")).toBeNull();
    expect(getArticle("")).toBeNull();
  });
});

describe("searchArticles", () => {
  it("finds an article by one of its keywords", () => {
    // "csv" is a keyword on the import article, not a word in its title.
    const slugs = searchArticles("csv").map((a) => a.slug);
    expect(slugs).toContain("csv-import");
  });

  it("finds an article by a word that only appears in its body", () => {
    // "robots" appears once, in the campaign article's body.
    const slugs = searchArticles("robots").map((a) => a.slug);
    expect(slugs).toContain("campaigns-and-research");
  });

  it("finds an article by a word that only appears inside a table", () => {
    // "multiplier" is a table heading in the scoring article.
    const slugs = searchArticles("multiplier").map((a) => a.slug);
    expect(slugs).toContain("how-scoring-works");
  });

  it("is case insensitive", () => {
    expect(searchArticles("GMAIL").map((a) => a.slug)).toContain("approving-and-gmail");
  });

  it("requires every term to match, so extra words narrow the result", () => {
    const one = searchArticles("draft");
    const two = searchArticles("draft blocked");
    expect(two.length).toBeLessThanOrEqual(one.length);
    expect(two.map((a) => a.slug)).toContain("why-drafts-get-blocked");
  });

  it("returns an empty list for nonsense", () => {
    expect(searchArticles("zzzqqqxyzzy")).toEqual([]);
    expect(searchArticles("gmail zzzqqqxyzzy")).toEqual([]);
  });

  it("returns every article for an empty or whitespace query", () => {
    expect(searchArticles("")).toHaveLength(ARTICLES.length);
    expect(searchArticles("   ")).toHaveLength(ARTICLES.length);
  });

  it("ranks a title or summary match above a body-only match", () => {
    const results = searchArticles("scoring");
    expect(results.length).toBeGreaterThan(1);
    expect(results[0]?.slug).toBe("how-scoring-works");
  });
});

describe("sections", () => {
  it("has at least one article in every declared section", () => {
    for (const s of HELP_SECTIONS) {
      expect(articlesInSection(s.key).length, `section ${s.key} is empty`).toBeGreaterThan(0);
    }
  });

  it("walks prev and next within a section without leaving it", () => {
    for (const s of HELP_SECTIONS) {
      const siblings = articlesInSection(s.key as SectionKey);
      const first = siblings[0];
      const last = siblings[siblings.length - 1];
      expect(first).toBeDefined();
      expect(last).toBeDefined();
      expect(sectionNeighbours(first!.slug).prev).toBeNull();
      expect(sectionNeighbours(last!.slug).next).toBeNull();
      for (const a of siblings) {
        const { prev, next } = sectionNeighbours(a.slug);
        if (prev) expect(prev.section).toBe(a.section);
        if (next) expect(next.section).toBe(a.section);
      }
    }
  });

  it("returns no neighbours for an unknown slug", () => {
    expect(sectionNeighbours("no-such-article")).toEqual({ prev: null, next: null });
  });
});

describe("headingId", () => {
  it("slugifies a heading", () => {
    expect(headingId("Two separate confidence gates")).toBe("two-separate-confidence-gates");
  });

  it("never returns an empty id", () => {
    expect(headingId("!!!")).toBe("section");
  });
});
