import { describe, expect, it } from "vitest";
import {
  CHARS_PER_TOKEN,
  estimateDraftingCost,
  estimatePlacesCalls,
  estimateResearchCost,
  estimateTokensFromChars,
  formatTokens,
  formatUsd,
  MODEL_PRICING,
  TYPICAL_OUTPUT_RATIO,
} from "@/lib/campaigns/cost";

/**
 * The figure this produces is shown to someone immediately before they spend
 * money, so the arithmetic is pinned down here rather than eyeballed in the UI.
 */

describe("estimateTokensFromChars", () => {
  it("converts characters at the documented ratio, rounding up", () => {
    expect(estimateTokensFromChars(CHARS_PER_TOKEN * 100)).toBe(100);
    expect(estimateTokensFromChars(1)).toBe(1);
  });

  it("treats nonsense input as zero rather than NaN", () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(-50)).toBe(0);
    expect(estimateTokensFromChars(Number.NaN)).toBe(0);
  });
});

describe("estimateDraftingCost", () => {
  const base = { model: "claude-sonnet-5", avgPromptChars: 7400, maxOutputTokens: 1024 };

  it("prices a known model from the published rates", () => {
    const e = estimateDraftingCost({ ...base, leadCount: 25 });
    const perDraftInput = Math.ceil(7400 / CHARS_PER_TOKEN);
    const perDraftOutput = Math.ceil(1024 * TYPICAL_OUTPUT_RATIO);

    expect(e.priced).toBe(true);
    expect(e.inputTokens).toBe(perDraftInput * 25);
    expect(e.outputTokens).toBe(perDraftOutput * 25);
    expect(e.inputUsd).toBeCloseTo((perDraftInput * 25 * 3) / 1_000_000, 10);
    expect(e.outputUsd).toBeCloseTo((perDraftOutput * 25 * 15) / 1_000_000, 10);
    expect(e.totalUsd).toBeCloseTo(e.inputUsd + e.outputUsd, 10);
  });

  it("reports the worst case at or above the expected cost", () => {
    const e = estimateDraftingCost({ ...base, leadCount: 25 });
    expect(e.maxOutputTokens).toBe(1024 * 25);
    expect(e.maxTotalUsd).toBeGreaterThan(e.totalUsd);
  });

  it("refuses to price an unrecognised model instead of guessing", () => {
    const e = estimateDraftingCost({ ...base, model: "some-future-model", leadCount: 10 });
    expect(e.priced).toBe(false);
    expect(e.totalUsd).toBe(0);
    expect(e.inputUsd).toBe(0);
    // Token counts are still useful even when the rate is unknown.
    expect(e.inputTokens).toBeGreaterThan(0);
    expect(e.modelLabel).toBe("some-future-model");
  });

  it("scales linearly with lead count", () => {
    const one = estimateDraftingCost({ ...base, leadCount: 1 });
    const ten = estimateDraftingCost({ ...base, leadCount: 10 });
    expect(ten.totalUsd).toBeCloseTo(one.totalUsd * 10, 10);
    expect(ten.perLeadUsd).toBeCloseTo(one.totalUsd, 10);
  });

  it("returns a zeroed estimate for an empty campaign without dividing by zero", () => {
    const e = estimateDraftingCost({ ...base, leadCount: 0 });
    expect(e.totalUsd).toBe(0);
    expect(e.perLeadUsd).toBe(0);
    expect(Number.isNaN(e.perLeadUsd)).toBe(false);
  });

  it("costs Opus above Sonnet above Haiku for the same work", () => {
    const at = (model: string) => estimateDraftingCost({ ...base, model, leadCount: 50 }).totalUsd;
    expect(at("claude-opus-5")).toBeGreaterThan(at("claude-sonnet-5"));
    expect(at("claude-sonnet-5")).toBeGreaterThan(at("claude-haiku-4-5"));
  });

  it("prices the app's default model", () => {
    // The app ships AI_MODEL=claude-sonnet-5; an unpriced default would mean
    // nobody ever sees a dollar figure.
    expect(MODEL_PRICING["claude-sonnet-5"]).toBeDefined();
  });

  it("floors a fractional lead count rather than producing fractional tokens", () => {
    const e = estimateDraftingCost({ ...base, leadCount: 4.7 });
    expect(e.leadCount).toBe(4);
    expect(Number.isInteger(e.inputTokens)).toBe(true);
  });
});

describe("formatUsd", () => {
  it("never shows a billable run as free", () => {
    // $0.004 of real spend rounding to "$0.00" is the one error worth avoiding.
    expect(formatUsd(0.004)).toBe("$0.01");
    expect(formatUsd(0.0001)).toBe("$0.01");
  });

  it("shows nothing for genuinely zero", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(-1)).toBe("$0.00");
    expect(formatUsd(Number.NaN)).toBe("$0.00");
  });

  it("uses cents up to the hundreds", () => {
    expect(formatUsd(0.52)).toBe("$0.52");
    expect(formatUsd(5.2)).toBe("$5.20");
    expect(formatUsd(99.994)).toBe("$99.99");
  });

  it("drops cents and groups thousands above $100", () => {
    expect(formatUsd(1234.56)).toBe("$1,235");
  });
});

describe("formatTokens", () => {
  it("abbreviates at each magnitude", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(840)).toBe("840");
    expect(formatTokens(18_400)).toBe("18.4k");
    expect(formatTokens(20_000)).toBe("20k");
    expect(formatTokens(2_500_000)).toBe("2.5M");
  });
});

describe("estimatePlacesCalls", () => {
  it("mirrors the provider's paging for a realistic campaign", () => {
    // 11 categories, up to 100 leads: over-fetch caps at 200 results, which is
    // 10 pages — well under the 33-page ceiling the categories would allow.
    expect(estimatePlacesCalls(11, 100)).toBe(10);
  });

  it("is bounded by the per-category page cap when categories are few", () => {
    // One category can only page three times, however many leads are wanted.
    expect(estimatePlacesCalls(1, 200)).toBe(3);
    expect(estimatePlacesCalls(2, 200)).toBe(6);
  });

  it("never returns zero calls", () => {
    expect(estimatePlacesCalls(0, 0)).toBe(1);
    expect(estimatePlacesCalls(1, 1)).toBe(1);
  });

  it("stops growing once the over-fetch limit is reached", () => {
    // maxLeads above ~67 all hit the 200-result ceiling.
    expect(estimatePlacesCalls(20, 100)).toBe(estimatePlacesCalls(20, 500));
  });
});

describe("estimateResearchCost", () => {
  it("prices the expected calls and reports the ceiling separately", () => {
    const e = estimateResearchCost(11, 100);
    expect(e.calls).toBe(10);
    expect(e.totalUsd).toBeCloseTo(10 * 0.04, 10);
    expect(e.maxTotalUsd).toBeGreaterThanOrEqual(e.totalUsd);
  });

  it("carries the free allowance so the figure can be read in context", () => {
    expect(estimateResearchCost(5, 50).freeCallsPerMonth).toBe(5000);
  });

  it("never reports a ceiling below the expected cost", () => {
    for (const [cats, leads] of [[1, 200], [3, 10], [40, 200]] as const) {
      const e = estimateResearchCost(cats, leads);
      expect(e.maxCalls).toBeGreaterThanOrEqual(e.calls);
    }
  });
});
