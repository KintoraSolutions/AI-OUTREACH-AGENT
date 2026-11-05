import { describe, expect, it } from "vitest";
import { CHAPTERS, CLOSING, chapterById, type Block } from "@/lib/tutorial/chapters";
import { CHECKLIST_KEYS } from "@/lib/onboarding/checklist";

/**
 * The tutorial's content model is data, so it is checkable. These tests guard
 * the contracts it shares with other parts of the app: the checklist keys that
 * decide "you have already done this", the routes a CTA points at, and the help
 * slugs the help centre guarantees. A typo in any of those would otherwise ship
 * as a dead link or a chapter that never marks itself complete.
 */

/**
 * The slugs the help centre guarantees will exist. Kept here rather than
 * imported so this test fails loudly if the tutorial starts linking somewhere
 * outside the agreed set, instead of silently agreeing with a changed list.
 */
const GUARANTEED_HELP_SLUGS = [
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

describe("chapter identity", () => {
  it("has chapters", () => {
    expect(CHAPTERS.length).toBeGreaterThan(0);
  });

  it("gives every chapter a unique id", () => {
    const ids = CHAPTERS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses url-safe ids", () => {
    for (const c of CHAPTERS) {
      expect(c.id, `chapter "${c.title}"`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("gives every chapter a title and a goal", () => {
    for (const c of CHAPTERS) {
      expect(c.title.trim(), `chapter "${c.id}"`).not.toBe("");
      expect(c.goal.trim(), `chapter "${c.id}"`).not.toBe("");
    }
  });
});

describe("chapter bodies", () => {
  it("gives every chapter a non-empty body", () => {
    for (const c of CHAPTERS) {
      expect(c.body.length, `chapter "${c.id}"`).toBeGreaterThan(0);
    }
  });

  it("never emits an empty block", () => {
    const isEmpty = (b: Block): boolean => {
      switch (b.kind) {
        case "p":
          return b.text.trim() === "";
        case "steps":
        case "list":
          return b.items.length === 0 || b.items.some((i) => i.trim() === "");
        case "definitions":
          return (
            b.items.length === 0 ||
            b.items.some((i) => i.term.trim() === "" || i.text.trim() === "")
          );
        case "note":
          return b.title.trim() === "" || b.text.trim() === "";
        case "table":
          return b.head.length === 0 || b.rows.length === 0;
      }
    };

    for (const c of CHAPTERS) {
      for (const [i, block] of c.body.entries()) {
        expect(isEmpty(block), `chapter "${c.id}" block ${i} (${block.kind})`).toBe(false);
      }
    }
  });

  it("keeps every table row the same width as its header", () => {
    for (const c of CHAPTERS) {
      for (const block of c.body) {
        if (block.kind !== "table") continue;
        for (const [r, row] of block.rows.entries()) {
          expect(row.length, `chapter "${c.id}" table row ${r}`).toBe(block.head.length);
        }
      }
    }
  });

  it("never leaves a lookFor entry blank", () => {
    for (const c of CHAPTERS) {
      for (const label of c.lookFor ?? []) {
        expect(label.trim(), `chapter "${c.id}"`).not.toBe("");
      }
    }
  });
});

describe("shared contracts", () => {
  it("only requires real ChecklistState keys", () => {
    for (const c of CHAPTERS) {
      if (!c.requires) continue;
      expect(CHECKLIST_KEYS, `chapter "${c.id}"`).toContain(c.requires);
    }
  });

  it("never points two chapters at the same checklist key", () => {
    const required = CHAPTERS.map((c) => c.requires).filter(Boolean);
    expect(new Set(required).size).toBe(required.length);
  });

  it("gives every cta an in-app href", () => {
    for (const c of CHAPTERS) {
      if (!c.cta) continue;
      expect(c.cta.href, `chapter "${c.id}"`).toMatch(/^\//);
      expect(c.cta.label.trim(), `chapter "${c.id}"`).not.toBe("");
    }
  });

  it("only links to guaranteed help slugs", () => {
    for (const c of CHAPTERS) {
      if (!c.helpSlug) continue;
      expect(GUARANTEED_HELP_SLUGS, `chapter "${c.id}"`).toContain(c.helpSlug);
    }
  });

  it("closes with in-app links", () => {
    expect(CLOSING.links.length).toBeGreaterThan(0);
    for (const link of CLOSING.links) {
      expect(link.href).toMatch(/^\//);
      expect(link.label.trim()).not.toBe("");
    }
  });
});

describe("chapterById", () => {
  it("finds every chapter by its own id", () => {
    for (const c of CHAPTERS) {
      expect(chapterById(c.id)).toBe(c);
    }
  });

  it("returns null for an unknown id", () => {
    expect(chapterById("no-such-chapter")).toBeNull();
    expect(chapterById("")).toBeNull();
  });
});
