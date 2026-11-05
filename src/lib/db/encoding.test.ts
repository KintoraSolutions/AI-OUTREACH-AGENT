import { describe, expect, it } from "vitest";
import {
  foldToLatin1,
  isUnicodeEncoding,
  needsSanitizing,
  sanitizeDeep,
  sanitizeForEncoding,
} from "@/lib/db/encoding";

/**
 * The emoji below is the one that actually cost a lead: U+1F4DE (telephone
 * receiver) arrives as the byte sequence `0xf0 0x9f 0x93 0x9e`, which is what
 * Postgres named in the 22P05 error when `clinic.create()` failed.
 */
const PHONE = "\u{1F4DE}";

describe("isUnicodeEncoding", () => {
  it("recognises the names Postgres reports for UTF-8", () => {
    expect(isUnicodeEncoding("UTF8")).toBe(true);
    expect(isUnicodeEncoding("utf-8")).toBe(true);
    expect(isUnicodeEncoding("UNICODE")).toBe(true);
  });

  it("does not mistake a single-byte encoding for Unicode", () => {
    expect(isUnicodeEncoding("WIN1252")).toBe(false);
    expect(isUnicodeEncoding("LATIN1")).toBe(false);
  });
});

describe("foldToLatin1", () => {
  it("keeps plain ASCII untouched", () => {
    expect(foldToLatin1("Runway Health - London")).toBe("Runway Health - London");
  });

  it("keeps accented Latin characters, which cp1252 can store", () => {
    expect(foldToLatin1("Clinique Santé Montréal")).toBe("Clinique Santé Montréal");
    expect(foldToLatin1("Müller Physio")).toBe("Müller Physio");
  });

  it("keeps the cp1252 typographic extras rather than stripping them", () => {
    // Curly quotes, en/em dashes and the ellipsis all exist in cp1252.
    expect(foldToLatin1("‘a’ “b” – — … €")).toBe(
      "‘a’ “b” – — … €",
    );
  });

  it("drops the emoji that was losing leads, keeping the name", () => {
    expect(foldToLatin1(`Runway Health ${PHONE}`)).toBe("Runway Health");
    expect(foldToLatin1(`${PHONE} Call Us`)).toBe("Call Us");
  });

  it("does not leave a double space where a symbol was removed", () => {
    expect(foldToLatin1(`Runway ${PHONE} Health`)).toBe("Runway Health");
  });

  it("transliterates CJK and other scripts down to nothing rather than failing", () => {
    // The earlier ErrorLog failure carried 0xe5 0xa4 0xa9 — the character 天.
    expect(foldToLatin1("天")).toBe("");
    expect(foldToLatin1("London 天 Clinic")).toBe("London Clinic");
  });

  it("decomposes a letter cp1252 lacks instead of deleting it", () => {
    // "ā" is not in cp1252, but "a" is — losing the macron beats losing the letter.
    expect(foldToLatin1("Kahalā Clinic")).toBe("Kahala Clinic");
  });

  it("maps common symbols to readable ASCII", () => {
    expect(foldToLatin1("Open 9→5")).toBe("Open 9->5");
    expect(foldToLatin1("Rated ★ clinic")).toBe("Rated clinic");
  });

  it("turns a non-breaking space into a normal one", () => {
    expect(foldToLatin1("London Clinic")).toBe("London Clinic");
  });

  it("keeps newlines and tabs but drops other control characters", () => {
    expect(foldToLatin1("a\nb\tc")).toBe("a\nb\tc");
    expect(foldToLatin1("a\u0000b\u0007c")).toBe("abc");
  });

  it("returns an empty string for text that is entirely unsupported", () => {
    expect(foldToLatin1(`${PHONE}${PHONE}`)).toBe("");
  });
});

describe("sanitizeForEncoding", () => {
  it("is a pass-through on a UTF-8 database", () => {
    // The point of the encoding check: once the database is fixed, this costs
    // nothing and the emoji is preserved.
    const name = `Runway Health ${PHONE}`;
    expect(sanitizeForEncoding(name, "UTF8")).toBe(name);
  });

  it("folds on a WIN1252 database", () => {
    expect(sanitizeForEncoding(`Runway Health ${PHONE}`, "WIN1252")).toBe("Runway Health");
  });

  it("preserves null and undefined, which are valid column values", () => {
    expect(sanitizeForEncoding(null, "WIN1252")).toBeNull();
    expect(sanitizeForEncoding(undefined, "WIN1252")).toBeUndefined();
  });

  it("returns the identical reference when nothing changed", () => {
    const value = "Plain Clinic";
    expect(sanitizeForEncoding(value, "WIN1252")).toBe(value);
  });
});

describe("needsSanitizing", () => {
  it("flags only what would actually fail", () => {
    expect(needsSanitizing(`Runway ${PHONE}`, "WIN1252")).toBe(true);
    expect(needsSanitizing("Runway Health", "WIN1252")).toBe(false);
    expect(needsSanitizing("Santé", "WIN1252")).toBe(false);
  });

  it("never flags anything on a Unicode database", () => {
    expect(needsSanitizing(`Runway ${PHONE}`, "UTF8")).toBe(false);
  });
});

describe("sanitizeDeep", () => {
  const PHONE_EMOJI = "\u{1F4DE}";

  it("returns the same reference untouched on a UTF-8 database", () => {
    const input = { name: `Clinic ${PHONE_EMOJI}` };
    expect(sanitizeDeep(input, "UTF8")).toBe(input);
  });

  it("folds strings nested through objects and arrays", () => {
    const input = {
      candidate: { name: `Runway Health ${PHONE_EMOJI}` },
      sources: [{ url: "https://x.example", notes: `tel ${PHONE_EMOJI}` }],
      findings: [{ evidence: "\u5929 evidence" }],
    };
    const out = sanitizeDeep(input, "WIN1252");
    expect(out.candidate.name).toBe("Runway Health");
    expect(out.sources[0]!.notes).toBe("tel");
    expect(out.findings[0]!.evidence).toBe("evidence");
  });

  it("leaves dates, numbers, booleans and null alone", () => {
    const when = new Date("2026-01-01T00:00:00Z");
    const out = sanitizeDeep(
      { when, count: 3, ok: true, missing: null, nothing: undefined },
      "WIN1252",
    );
    expect(out.when).toBe(when);
    expect(out.count).toBe(3);
    expect(out.ok).toBe(true);
    expect(out.missing).toBeNull();
    expect(out.nothing).toBeUndefined();
  });

  it("does not disturb values that were already safe", () => {
    const out = sanitizeDeep({ name: "Plain Clinic", url: "https://a.example" }, "WIN1252");
    expect(out).toEqual({ name: "Plain Clinic", url: "https://a.example" });
  });
});
