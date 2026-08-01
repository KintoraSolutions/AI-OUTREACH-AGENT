import Papa from "papaparse";

export interface ParsedCsv {
  rows: Record<string, string>[];
  headers: string[];
  errors: string[];
}

/** Parse CSV text into header-keyed rows. Values are trimmed strings. */
export function parseCsv(text: string): ParsedCsv {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  const errors = result.errors.map(
    (e) => `Row ${typeof e.row === "number" ? e.row + 1 : "?"}: ${e.message}`,
  );

  return {
    rows: (result.data ?? []).filter((r) => Object.values(r).some((v) => v && v.length > 0)),
    headers: result.meta.fields ?? [],
    errors,
  };
}

function escapeCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/** Serialize rows to CSV with proper quoting. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCell(c.value(row))).join(","))
    .join("\r\n");
  return body ? `${head}\r\n${body}` : head;
}
