import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("parses headered rows and trims values", () => {
    const { rows, headers } = parseCsv("Name, Website\n Riverside Physio , https://x.example ");
    expect(headers).toEqual(["Name", "Website"]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ Name: "Riverside Physio", Website: "https://x.example" });
  });

  it("skips fully-empty rows", () => {
    const { rows } = parseCsv("Name\nA\n\n\nB\n");
    expect(rows.map((r) => r.Name)).toEqual(["A", "B"]);
  });

  it("handles quoted values containing commas", () => {
    const { rows } = parseCsv('Name,Address\n"Clinic, LLC","1 St, Suite 2"');
    expect(rows[0]).toEqual({ Name: "Clinic, LLC", Address: "1 St, Suite 2" });
  });
});

describe("toCsv", () => {
  it("serializes rows with a header and quotes special characters", () => {
    const csv = toCsv(
      [{ name: "Clinic, LLC", note: 'has "quote"' }],
      [
        { header: "Name", value: (r) => r.name },
        { header: "Note", value: (r) => r.note },
      ],
    );
    expect(csv).toBe('Name,Note\r\n"Clinic, LLC","has ""quote"""');
  });

  it("emits only the header row when there are no records", () => {
    const csv = toCsv([] as { name: string }[], [{ header: "Name", value: (r) => r.name }]);
    expect(csv).toBe("Name");
  });
});
