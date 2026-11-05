import { FindingCategory } from "@prisma/client";
import {
  CONFIDENCE_LABELS,
  FINDING_CATEGORY_LABELS,
  SCORE_CONFIDENCE_LABELS,
  SERVICE_LABELS,
  isFactConfidence,
} from "@/lib/leads/constants";
import { AppWindow, Chip, Meter, Row } from "./product-chrome";
import {
  SAMPLE_AUDIT_INPUT,
  SAMPLE_CAPS,
  SAMPLE_CLINIC_ADDRESS,
  SAMPLE_CLINIC_NAME,
  SAMPLE_CLINIC_SITE,
  SAMPLE_FINDINGS,
  SAMPLE_SCORE,
} from "./sample-lead";
import { BRAND, FG_2, FG_3, FG_4, LINE } from "./theme";

/**
 * What a research run produces, for the one clinic the page follows.
 *
 * Nothing numeric in this file is written by hand. The findings come from
 * `buildAuditFindings` and every point, subtotal, cap, recommendation and
 * confidence level comes from `scoreClinic`, both called in `sample-lead.ts`
 * against the product's own default configuration. An earlier version of this
 * file carried hand-picked findings and hand-written subtotals, and a QA
 * recomputation found four separate places where they disagreed with the
 * engine. The page's central claim is that the score is reproducible, so the
 * figures reproduce it rather than describe it.
 */

const CATEGORY_ORDER: FindingCategory[] = [
  FindingCategory.WEBSITE,
  FindingCategory.SOFTWARE,
  FindingCategory.KLEARQ,
  FindingCategory.CONTACTABILITY,
  FindingCategory.BUSINESS_FIT,
];

/** Verified evidence is a fact; anything weaker is an inference. */
function confidenceTone(c: string): "ok" | "brand" | "neutral" {
  if (c === "VERIFIED") return "ok";
  if (c === "STRONG_INFERENCE") return "brand";
  return "neutral";
}

/* -------------------------------------------------------------------------- */
/* 01 Discover                                                                 */
/* -------------------------------------------------------------------------- */

const DISCOVERED = [
  { name: "Cedar Park Vision Centre", addr: "92 Commissioners Rd W, London, ON" },
  { name: "Northgate Eye Care", addr: "1105 Wellington Rd, London, ON" },
  { name: SAMPLE_CLINIC_NAME, addr: SAMPLE_CLINIC_ADDRESS },
  { name: "Harbour Street Optical", addr: "304 B Wharncliffe Rd S, London, ON" },
];

export function DiscoverFigure() {
  return (
    <AppWindow screen="Campaign" breadcrumb="Campaigns › Optometry, London ON">
      <div style={{ background: "#1a1a1b" }}>
        <div className="px-4 pb-3 pt-4">
          <h3 className="font-display text-[17px] font-semibold leading-tight text-white">
            Optometry, London ON
          </h3>
          <p className="mt-1 text-[11.5px]" style={{ color: FG_4 }}>
            Optometry · London, Ontario · within 5 km · excluding &ldquo;hospital&rdquo;
          </p>
          <div className="mt-2.5">
            <Chip mono>40 of 40 requested</Chip>
          </div>
        </div>

        <div style={{ borderTop: `1px solid ${LINE}` }}>
          {DISCOVERED.map((c, i) => (
            <Row key={c.name} first={i === 0} highlight={c.name === SAMPLE_CLINIC_NAME}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div
                    className="truncate text-[12.5px] font-semibold"
                    style={{ color: c.name === SAMPLE_CLINIC_NAME ? BRAND : "#ffffff" }}
                  >
                    {c.name}
                  </div>
                  <div className="truncate text-[11px]" style={{ color: FG_4 }}>
                    {c.addr}
                  </div>
                </div>
                <Chip>Discovered</Chip>
              </div>
            </Row>
          ))}
          <Row>
            <p className="text-[11.5px] leading-relaxed" style={{ color: FG_4 }}>
              Discovery over-fetches, so clinics beyond the requested 40 stay in reserve and replace
              any whose research fails.
            </p>
          </Row>
        </div>
      </div>
    </AppWindow>
  );
}

/* -------------------------------------------------------------------------- */
/* 02 Research                                                                 */
/* -------------------------------------------------------------------------- */

const OVERVIEW: [string, string][] = [
  ["Website", SAMPLE_CLINIC_SITE],
  ["Main phone", SAMPLE_AUDIT_INPUT.mainPhone ?? "Not found"],
  ["Public email", SAMPLE_AUDIT_INPUT.publicEmail ?? "Not found"],
  ["Contact page", `${SAMPLE_CLINIC_SITE}/contact`],
];

/**
 * The lead detail lists every finding. Eight of fifteen is as much as a figure
 * can carry without burying the rest of the page, and the header prints the
 * real total, so the excerpt does not overstate what was found.
 */
const SHOWN_FINDINGS = SAMPLE_FINDINGS.slice(0, 8);

export function ResearchFigure() {
  return (
    <AppWindow screen="Lead detail" breadcrumb={`Leads › ${SAMPLE_CLINIC_NAME}`}>
      <div style={{ background: "#1a1a1b" }}>
        <div className="px-4 pb-3 pt-4">
          <h3 className="font-display text-[17px] font-semibold leading-tight text-white">
            {SAMPLE_CLINIC_NAME}
          </h3>
          <p className="mt-1 text-[11.5px]" style={{ color: FG_4 }}>
            Clinic overview
          </p>
        </div>

        <div style={{ borderTop: `1px solid ${LINE}` }}>
          {OVERVIEW.map(([label, value], i) => (
            <Row key={label} first={i === 0}>
              <div className="flex items-baseline justify-between gap-4">
                <span className="shrink-0 text-[11.5px]" style={{ color: FG_3 }}>
                  {label}
                </span>
                <span className="truncate text-[12px]" style={{ color: FG_2 }}>
                  {value}
                </span>
              </div>
            </Row>
          ))}
        </div>

        <div
          className="flex items-baseline justify-between px-4 py-2.5"
          style={{ borderTop: `1px solid ${LINE}`, background: "#161617" }}
        >
          <span className="text-[11.5px] font-semibold" style={{ color: FG_2 }}>
            Audit findings
          </span>
          <span className="font-mono text-[11px] tabular-nums" style={{ color: FG_4 }}>
            {SAMPLE_FINDINGS.length}
          </span>
        </div>

        <div>
          {SHOWN_FINDINGS.map((f, i) => (
            <Row key={f.code} first={i === 0}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12px]" style={{ color: FG_2 }}>
                    {f.finding}
                  </div>
                  <div className="mt-1 truncate font-mono text-[10.5px]" style={{ color: FG_4 }}>
                    {f.sourceUrl.replace(/^https?:\/\//, "")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Chip tone={isFactConfidence(f.confidence) ? "ok" : "neutral"}>
                    {isFactConfidence(f.confidence) ? "Fact" : "Inference"}
                  </Chip>
                  <Chip tone={confidenceTone(f.confidence)}>
                    {CONFIDENCE_LABELS[f.confidence]}
                  </Chip>
                </div>
              </div>
            </Row>
          ))}
          {SAMPLE_FINDINGS.length > SHOWN_FINDINGS.length ? (
            <Row>
              <span className="text-[11.5px]" style={{ color: FG_4 }}>
                {SAMPLE_FINDINGS.length - SHOWN_FINDINGS.length} more findings in this lead.
              </span>
            </Row>
          ) : null}
        </div>
      </div>
    </AppWindow>
  );
}

/* -------------------------------------------------------------------------- */
/* 03 Score                                                                    */
/* -------------------------------------------------------------------------- */

const SUBTOTAL: Record<FindingCategory, number> = {
  WEBSITE: SAMPLE_SCORE.websiteScore,
  SOFTWARE: SAMPLE_SCORE.softwareScore,
  KLEARQ: SAMPLE_SCORE.klearqScore,
  CONTACTABILITY: SAMPLE_SCORE.contactabilityScore,
  BUSINESS_FIT: SAMPLE_SCORE.businessFitScore,
};

/** Every contribution, strongest first, for the breakdown. */
const CONTRIBUTIONS = CATEGORY_ORDER.flatMap(
  (c) => SAMPLE_SCORE.breakdown.categories[c].contributions,
).sort((a, b) => b.points - a.points);

export function ScoreCard() {
  return (
    <AppWindow screen="Lead detail">
      <div style={{ background: "#1a1a1b" }}>
        <div className="px-4 pb-4 pt-4">
          <p className="text-[11.5px]" style={{ color: FG_4 }}>
            Lead score
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="font-display text-[36px] font-semibold leading-none tabular-nums text-white">
              {SAMPLE_SCORE.overallScore}
              <span className="text-[18px]" style={{ color: FG_4 }}>
                {" "}
                / 100
              </span>
            </span>
            <Chip tone="brand">{SERVICE_LABELS[SAMPLE_SCORE.recommendedService]}</Chip>
            <Chip>{SCORE_CONFIDENCE_LABELS[SAMPLE_SCORE.confidence]}</Chip>
          </div>

          <div className="mt-5 space-y-2.5">
            {CATEGORY_ORDER.map((c) => (
              <Meter
                key={c}
                label={FINDING_CATEGORY_LABELS[c]}
                value={SUBTOTAL[c]}
                max={SAMPLE_CAPS[c]}
              />
            ))}
          </div>
        </div>

        {/* A native details element, so the breakdown opens with JS disabled. */}
        <details style={{ borderTop: `1px solid ${LINE}` }}>
          <summary
            className="cursor-pointer list-none px-4 py-2.5 text-[12px] font-semibold [&::-webkit-details-marker]:hidden"
            style={{ color: BRAND }}
          >
            Score breakdown
          </summary>
          <div style={{ borderTop: `1px solid ${LINE}` }}>
            {CONTRIBUTIONS.map((c, i) => (
              <Row key={c.ruleId} first={i === 0}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[12px]" style={{ color: FG_2 }}>
                      {c.label}
                    </div>
                    <div className="text-[10.5px]" style={{ color: FG_4 }}>
                      {CONFIDENCE_LABELS[c.confidence]}
                    </div>
                  </div>
                  <span
                    className="shrink-0 font-mono text-[11.5px] tabular-nums"
                    style={{ color: FG_3 }}
                  >
                    {c.basePoints} × {c.confidenceMultiplier} = {c.points}
                  </span>
                </div>
              </Row>
            ))}
            <Row>
              <p className="text-[11px] leading-relaxed" style={{ color: FG_4 }}>
                {SAMPLE_SCORE.recommendationReason}
              </p>
            </Row>
          </div>
        </details>
      </div>
    </AppWindow>
  );
}
