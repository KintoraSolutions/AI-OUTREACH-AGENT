import { Download, Filter, Plus, Search } from "lucide-react";
import { SERVICE_LABELS } from "@/lib/leads/constants";
import { AppWindow, Chip } from "./product-chrome";
import { SAMPLE_CLINIC_ADDRESS, SAMPLE_CLINIC_NAME, SAMPLE_SCORE } from "./sample-lead";
import { BRAND, FG_3, FG_4, LINE, R_SM, SURFACE_2 } from "./theme";

/**
 * Hero product visual: the Leads workspace.
 *
 * Clinic names are representative, not the operator's real pipeline: a public
 * page should not publish who someone is prospecting, nor attach a low score
 * to a named real business. The chrome, columns and chips are exactly the
 * app's.
 *
 * Two things were corrected here after the audit.
 *
 * The scores used to read 78 / 64 / 52 / 31. Nothing in the product produces
 * numbers like that. The score counts *opportunity* found on a clinic's site,
 * and a real workspace runs in the teens to high thirties, which is why the
 * dashboard's "High priority" tile (score 70 or higher) sits at zero against
 * real data. Riverbend is 21 because that is the exact sum the scoring engine
 * returns for the six findings shown later on the page; the rest are in the
 * range the product actually produces.
 *
 * The column header reads "Overall /100". The app writes just "Overall", but
 * the old landing page printed a bare score three times and never once stated
 * the scale, so the denominator is carried here where a visitor meets it first.
 */
/** The app's own short confidence labels (lead-table.tsx:39). */
const CONF_SHORT = { HIGH: "High", MEDIUM: "Med", LOW: "Low" } as const;

const ROWS = [
  {
    name: SAMPLE_CLINIC_NAME,
    addr: SAMPLE_CLINIC_ADDRESS,
    score: SAMPLE_SCORE.overallScore,
    profile: [
      ["WEB", "Website", SAMPLE_SCORE.websiteScore],
      ["SW", "Custom software", SAMPLE_SCORE.softwareScore],
      ["PHO", "Phone operations", SAMPLE_SCORE.klearqScore],
      ["Con", "Contactability", SAMPLE_SCORE.contactabilityScore],
      ["Fit", "Business fit", SAMPLE_SCORE.businessFitScore],
    ],
    service: SERVICE_LABELS[SAMPLE_SCORE.recommendedService],
    tone: "brand",
    conf: CONF_SHORT[SAMPLE_SCORE.confidence],
  },
  {
    name: "Cedar Park Vision Centre",
    addr: "92 Commissioners Rd W, London, ON",
    score: 38,
    profile: [
      ["WEB", "Website", 12],
      ["SW", "Custom software", 7],
      ["PHO", "Phone operations", 11],
      ["Con", "Contactability", 4],
      ["Fit", "Business fit", 4],
    ],
    service: "Combined",
    tone: "brand",
    conf: "Med",
  },
  {
    name: "Northgate Eye Care",
    addr: "1105 Wellington Rd, London, ON",
    score: 29,
    profile: [
      ["WEB", "Website", 6],
      ["SW", "Custom software", 5],
      ["PHO", "Phone operations", 10],
      ["Con", "Contactability", 3],
      ["Fit", "Business fit", 5],
    ],
    service: "Phone operations",
    tone: "brand",
    conf: "Med",
  },
  {
    name: "Harbour Street Optical",
    addr: "304 B Wharncliffe Rd S, London, ON",
    score: 9,
    profile: [
      ["WEB", "Website", 2],
      ["SW", "Custom software", 0],
      ["PHO", "Phone operations", 2],
      ["Con", "Contactability", 1],
      ["Fit", "Business fit", 4],
    ],
    service: "None",
    tone: "neutral",
    conf: "Low",
  },
] as const;

const COLS =
  "grid-cols-[minmax(0,1fr)_62px] sm:grid-cols-[minmax(0,1.5fr)_62px_minmax(0,1.1fr)_128px]";

export function LeadsPreview() {
  return (
    <AppWindow screen="Leads" breadcrumb="Leads">
      <div style={{ background: "#1a1a1b" }}>
        {/* Page header + command bar */}
        <div className="px-4 pb-3 pt-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h3 className="font-display text-[19px] font-semibold leading-tight text-white">
                Leads
              </h3>
              <p className="mt-0.5 text-[11.5px]" style={{ color: FG_4 }}>
                Clinics in your outreach pipeline.
              </p>
            </div>
            <div className="hidden items-center gap-1.5 sm:flex">
              <span
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white"
                style={{ background: "#115ea3", borderRadius: R_SM }}
              >
                <Plus aria-hidden className="size-3" /> New lead
              </span>
              <span
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px]"
                style={{ border: `1px solid ${LINE}`, borderRadius: R_SM, color: FG_3 }}
              >
                <Download aria-hidden className="size-3" /> Export
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <span
              className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-[11px]"
              style={{ border: `1px solid ${LINE}`, borderRadius: R_SM, color: FG_4 }}
            >
              <Search aria-hidden className="size-3 shrink-0" />
              Search name, website, phone
            </span>
            <span
              className="inline-flex shrink-0 items-center gap-1 px-2 py-1.5 text-[11px]"
              style={{ border: `1px solid ${LINE}`, borderRadius: R_SM, color: FG_3 }}
            >
              <Filter aria-hidden className="size-3" /> Filters
            </span>
          </div>
        </div>

        {/* Table. Rows animate on mount in CSS alone, so the hero's product
            visual never waits on hydration. */}
        <div style={{ borderTop: `1px solid ${LINE}` }}>
          <div
            className={`grid items-center gap-3 px-4 py-2 text-[11px] font-semibold ${COLS}`}
            style={{
              color: FG_3,
              borderBottom: `1px solid ${LINE}`,
              background: "#161617",
            }}
          >
            <span>Clinic</span>
            <span className="text-right">Overall /100</span>
            <span className="hidden sm:block">Performance profile</span>
            <span className="hidden sm:block">Service and confidence</span>
          </div>

          {ROWS.map((r, i) => (
            <div
              key={r.name}
              className={`rise grid items-center gap-3 px-4 py-2.5 ${COLS}`}
              style={{
                borderBottom: i === ROWS.length - 1 ? "none" : `1px solid ${LINE}`,
                animationDelay: `${420 + i * 90}ms`,
                background: i === 0 ? SURFACE_2 : "transparent",
              }}
            >
              <div className="min-w-0">
                <div
                  className="truncate text-[12.5px] font-semibold"
                  style={{ color: i === 0 ? BRAND : "#ffffff" }}
                >
                  {r.name}
                </div>
                <div className="truncate text-[10.5px]" style={{ color: FG_4 }}>
                  {r.addr}
                </div>
              </div>

              <div
                className="text-right font-mono text-[20px] font-semibold leading-none tabular-nums"
                style={{ color: r.score >= 25 ? BRAND : FG_3 }}
              >
                {r.score}
              </div>

              {/* The five category subtotals, laid out as the app lays them
                  out. The abbreviations are the app's own; the page expands
                  all five in the scoring section rather than inventing a
                  different shorthand here. */}
              <div className="hidden grid-cols-3 gap-x-2.5 gap-y-1 font-mono text-[10.5px] sm:grid">
                {r.profile.map(([k, full, v]) => (
                  <span key={full} style={{ color: FG_4 }}>
                    <span aria-hidden="true">{k}</span>
                    <span className="sr-only">{full}</span>{" "}
                    <span className="tabular-nums" style={{ color: v > 0 ? FG_3 : FG_4 }}>
                      {v}
                    </span>
                  </span>
                ))}
              </div>

              <div className="hidden flex-wrap items-center gap-1 sm:flex">
                <Chip tone={r.tone}>{r.service}</Chip>
                <Chip tone="neutral">{r.conf}</Chip>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppWindow>
  );
}
