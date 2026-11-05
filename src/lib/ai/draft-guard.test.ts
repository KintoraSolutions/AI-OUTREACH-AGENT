import { describe, expect, it } from "vitest";
import { scanContent } from "@/lib/ai/draft-guard";
import { LENGTH_WORD_BANDS, wordBandFor, DEFAULT_EMAIL_VOICE } from "@/lib/ai/email-voice";

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

function scan(body: string, extra: Partial<Parameters<typeof scanContent>[0]> = {}) {
  return scanContent({
    body,
    subject: "A note for Bright Dental",
    clinicName: "Bright Dental",
    hasVerifiedEvidence: true,
    ...extra,
  });
}

const lengthWarning = (w: string[]) => w.some((x) => /words; the target is/.test(x));

describe("word count band", () => {
  it("does not warn on a short-voice draft that hit its own target", () => {
    // The regression: the guard used a fixed 80-150 band, so a 75-word body
    // produced for the 60-100 "short" voice always warned.
    const body = `Bright Dental ${words(74)}`;
    const band = wordBandFor({ ...DEFAULT_EMAIL_VOICE, length: "short" });
    expect(lengthWarning(scan(body, { wordBand: band }).warnings)).toBe(false);
  });

  it("still warns when a short-voice draft overshoots its band", () => {
    const body = `Bright Dental ${words(130)}`;
    const band = wordBandFor({ ...DEFAULT_EMAIL_VOICE, length: "short" });
    const w = scan(body, { wordBand: band }).warnings;
    expect(lengthWarning(w)).toBe(true);
    expect(w.join(" ")).toContain(`${LENGTH_WORD_BANDS.short.min} to ${LENGTH_WORD_BANDS.short.max}`);
  });

  it("defaults to the standard band so the human-edit path keeps working", () => {
    const body = `Bright Dental ${words(20)}`;
    const w = scan(body).warnings;
    expect(w.join(" ")).toContain(
      `${LENGTH_WORD_BANDS.standard.min} to ${LENGTH_WORD_BANDS.standard.max}`,
    );
  });

  it("accepts a standard-voice draft inside its band", () => {
    const body = `Bright Dental ${words(110)}`;
    expect(lengthWarning(scan(body).warnings)).toBe(false);
  });
});

describe("expected links", () => {
  it("warns when a requested supporting link is missing", () => {
    const body = `Bright Dental ${words(100)}`;
    const w = scan(body, { expectedLinks: ["https://acme.example/work"] }).warnings;
    expect(w.join(" ")).toContain("https://acme.example/work");
  });

  it("is satisfied by the link without its scheme", () => {
    const body = `Bright Dental acme.example/work ${words(100)}`;
    const w = scan(body, { expectedLinks: ["https://acme.example/work"] }).warnings;
    expect(w.some((x) => x.includes("missing the supporting link"))).toBe(false);
  });
});

describe("protected health information", () => {
  it("blocks identifiable patient data when the use case requires it", () => {
    const body = `Bright Dental, please include the MRN when you refer. ${words(90)}`;
    expect(scan(body, { blockPhi: true }).blockedReasons.join(" ")).toMatch(/protected health/i);
  });

  it("does not fire on ordinary referral copy", () => {
    const body = `Bright Dental, we treat vertigo and send patients back with clear notes. ${words(90)}`;
    expect(scan(body, { blockPhi: true }).blockedReasons).toEqual([]);
  });

  it("is off unless the use case turns it on", () => {
    const body = `Bright Dental, send the medical record number. ${words(90)}`;
    expect(scan(body).blockedReasons).toEqual([]);
  });
});

describe("existing safety checks still hold", () => {
  it("blocks a draft that drops the exact recipient name", () => {
    expect(scan(`Hello your clinic ${words(100)}`).blockedReasons.join(" ")).toMatch(/exact name/i);
  });

  it("blocks loss claims without verified evidence", () => {
    const body = `Bright Dental you are losing calls every week. ${words(90)}`;
    expect(
      scan(body, { hasVerifiedEvidence: false }).blockedReasons.join(" "),
    ).toMatch(/lost calls, lost revenue/i);
  });

  it("blocks an unfilled template placeholder", () => {
    const body = `Bright Dental [INSERT NAME] ${words(100)}`;
    expect(scan(body).blockedReasons.join(" ")).toMatch(/placeholder/i);
  });
});
