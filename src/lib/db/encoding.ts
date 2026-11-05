import { prisma } from "@/lib/db";

/**
 * Guard against losing a lead to a character the database cannot store.
 *
 * The embedded Postgres cluster is created with the Windows system locale, so
 * on an English/Canada machine the database lands on WIN1252 rather than UTF8.
 * Any clinic whose name, address or extracted text contains an emoji, CJK, or
 * any character outside Latin-1 then fails to INSERT with Postgres error 22P05
 * — and because that error is thrown from `clinic.create()`, the lead is lost
 * entirely rather than merely degraded.
 *
 * The real fix is a UTF8 database. This is the seatbelt: text is folded to what
 * the server can actually store, so the lead survives with a slightly tidied
 * name instead of vanishing. On a UTF8 database every function here is a
 * pass-through, so once the encoding is corrected this costs nothing and does
 * not have to be removed.
 */

/** Characters cp1252 maps into the 0x80-0x9F range that Latin-1 leaves undefined. */
const CP1252_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
  0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122,
  0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

/** Readable stand-ins for symbols that would otherwise be dropped silently. */
const TRANSLITERATIONS: Record<string, string> = {
  "→": "->",
  "←": "<-",
  "≥": ">=",
  "≤": "<=",
  "≠": "!=",
  "✓": "",
  "✔": "",
  "★": "",
  "☆": "",
  " ": " ",
};

let cachedEncoding: string | null = null;

/**
 * The server encoding of the connected database, cached for the process.
 *
 * Failure to determine it is treated as UTF8 — the safe default, since
 * sanitizing text that did not need it is the more damaging mistake.
 */
export async function getDatabaseEncoding(): Promise<string> {
  if (cachedEncoding) return cachedEncoding;
  try {
    const rows = await prisma.$queryRaw<{ encoding: string }[]>`
      SELECT pg_encoding_to_char(encoding) AS encoding
      FROM pg_database
      WHERE datname = current_database()
    `;
    cachedEncoding = rows[0]?.encoding?.toUpperCase() ?? "UTF8";
  } catch {
    cachedEncoding = "UTF8";
  }
  return cachedEncoding;
}

/** Test seam; also lets a caller reset after changing databases. */
export function __setCachedEncoding(encoding: string | null): void {
  cachedEncoding = encoding;
}

export function isUnicodeEncoding(encoding: string): boolean {
  const normalized = encoding.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized === "UTF8" || normalized === "UNICODE";
}

function representableInCp1252(codePoint: number): boolean {
  // C0 controls other than tab/newline/carriage return are not worth keeping.
  if (codePoint < 0x20) return codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d;
  if (codePoint <= 0xff) return codePoint < 0x80 || codePoint > 0x9f;
  return CP1252_EXTRAS.has(codePoint);
}

/**
 * Fold `text` to what a single-byte encoding can hold.
 *
 * Accents are preserved where the target supports them (é survives in cp1252);
 * everything else is decomposed and stripped of combining marks first, so "ā"
 * becomes "a" rather than disappearing. Only what survives neither step is
 * dropped. Collapsing whitespace at the end stops a removed emoji from leaving
 * a double space in the middle of a clinic name.
 */
export function foldToLatin1(text: string): string {
  let out = "";

  for (const char of text) {
    const code = char.codePointAt(0)!;

    // The explicit map runs first so a character that merely *fits* the target
    // encoding can still be normalized — a non-breaking space is valid cp1252
    // but is worth folding to a real space in a scraped clinic name.
    const replacement = TRANSLITERATIONS[char];
    if (replacement !== undefined) {
      out += replacement;
      continue;
    }

    if (representableInCp1252(code)) {
      out += char;
      continue;
    }

    // Decompose, then drop combining marks: "ā" -> "a", "ñ" -> "n".
    const stripped = char.normalize("NFKD").replace(/\p{M}/gu, "");
    for (const piece of stripped) {
      if (representableInCp1252(piece.codePointAt(0)!)) out += piece;
    }
  }

  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/**
 * Make `value` safe for the given server encoding. A Unicode database returns
 * the value untouched.
 */
export function sanitizeForEncoding<T extends string | null | undefined>(
  value: T,
  encoding: string,
): T {
  if (value == null || isUnicodeEncoding(encoding)) return value;
  const folded = foldToLatin1(value);
  return (folded === value ? value : folded) as T;
}

/** True when `value` would fail to store under `encoding`. */
export function needsSanitizing(value: string, encoding: string): boolean {
  if (isUnicodeEncoding(encoding)) return false;
  return foldToLatin1(value) !== value;
}

/**
 * Fold every string inside a structure.
 *
 * Research results carry text across many nested fields — the clinic, its
 * locations, contacts, sources, audit findings and activity note — and any one
 * of them can hold the character that fails the insert. Sanitizing at the top
 * of the write is simpler and safer than remembering to wrap thirty fields.
 *
 * On a Unicode database this returns the original reference without walking,
 * so it costs nothing once the encoding is corrected.
 */
export function sanitizeDeep<T>(value: T, encoding: string): T {
  if (isUnicodeEncoding(encoding)) return value;
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (typeof value === "string") return foldToLatin1(value);
  if (value == null || typeof value !== "object") return value;
  // Dates, Buffers and Prisma's Decimal are values, not containers to rebuild.
  if (value instanceof Date || value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return value.map(walk);

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = walk(inner);
  }
  return out;
}
