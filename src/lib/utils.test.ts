import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

/**
 * Regression guard for a silent, high-impact class-merging bug.
 *
 * tailwind-merge only knows Tailwind's own font sizes. Before `cn` was taught
 * the Fluent ramp, a custom size like `text-caption1` was classified as a text
 * COLOR, so it evicted the real color from the same class group — every small
 * solid button rendered at 2.88:1 instead of 5.38:1.
 *
 * The failure mode is invisible in review (both classes are present in the
 * source) and only shows up in the rendered DOM, so it is worth a test.
 */
describe("cn", () => {
  it("keeps a text color when a Fluent font size is also applied", () => {
    const result = cn("text-[var(--fl-on-brand)]", "text-caption1");
    expect(result).toContain("text-[var(--fl-on-brand)]");
    expect(result).toContain("text-caption1");
  });

  it("keeps the color regardless of which order the classes arrive in", () => {
    const result = cn("text-caption1", "text-[var(--fl-on-brand)]");
    expect(result).toContain("text-[var(--fl-on-brand)]");
    expect(result).toContain("text-caption1");
  });

  it.each([
    "text-caption2",
    "text-caption1",
    "text-body1",
    "text-body2",
    "text-subtitle2",
    "text-subtitle1",
    "text-title3",
    "text-title2",
    "text-title1",
    "text-large-title",
  ])("treats %s as a font size, not a color", (size) => {
    expect(cn("text-[var(--fl-fg-2)]", size)).toContain("text-[var(--fl-fg-2)]");
  });

  it("still lets a later font size override an earlier one", () => {
    const result = cn("text-body1", "text-title3");
    expect(result).toContain("text-title3");
    expect(result).not.toContain("text-body1");
  });

  it("still lets a later text color override an earlier one", () => {
    const result = cn("text-[var(--fl-fg-3)]", "text-[var(--fl-danger-fg)]");
    expect(result).toContain("text-[var(--fl-danger-fg)]");
    expect(result).not.toContain("text-[var(--fl-fg-3)]");
  });

  it("keeps Tailwind's own size conflict resolution intact", () => {
    expect(cn("text-sm", "text-lg")).toBe("text-lg");
  });
});
