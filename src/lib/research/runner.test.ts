import { describe, expect, it } from "vitest";
import { chooseRunner } from "@/lib/research/runner";

/**
 * Runner-selection policy (docs/planning/build-plan.md Section 5, items 2-4). These assert that the
 * inline runner can never be used in production and that a missing Inngest
 * configuration in production produces a clear error rather than a silent
 * fallback.
 */
describe("chooseRunner", () => {
  it("uses Inngest in production when it is configured", () => {
    const result = chooseRunner({ nodeEnv: "production", inngestConfigured: true });
    expect(result).toEqual({ kind: "inngest" });
  });

  it("refuses to run (clear error) in production when Inngest is NOT configured", () => {
    const result = chooseRunner({ nodeEnv: "production", inngestConfigured: false });
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toMatch(/INNGEST_EVENT_KEY/);
      expect(result.error).toMatch(/INNGEST_SIGNING_KEY/);
      // It must explain WHY inline is not used, not silently downgrade.
      expect(result.error.toLowerCase()).toContain("inline");
    }
  });

  it("never falls back to the inline runner in production, even with an override", () => {
    const result = chooseRunner({
      nodeEnv: "production",
      inngestConfigured: false,
      override: "inline",
    });
    // The override cannot force inline in production; it still errors.
    expect("error" in result).toBe(true);
  });

  it("prefers Inngest in development when configured", () => {
    const result = chooseRunner({ nodeEnv: "development", inngestConfigured: true });
    expect(result).toEqual({ kind: "inngest" });
  });

  it("falls back to the inline runner in development when Inngest is not configured", () => {
    const result = chooseRunner({ nodeEnv: "development", inngestConfigured: false });
    expect(result).toEqual({ kind: "inline" });
  });

  it("honors an explicit inline override outside production (local debugging)", () => {
    const result = chooseRunner({
      nodeEnv: "development",
      inngestConfigured: true,
      override: "inline",
    });
    expect(result).toEqual({ kind: "inline" });
  });

  it("uses the inline runner for the test environment by default", () => {
    const result = chooseRunner({ nodeEnv: "test", inngestConfigured: false });
    expect(result).toEqual({ kind: "inline" });
  });
});
