import { MailX, TriangleAlert } from "lucide-react";
import { estimateDraftingCost, formatUsd } from "@/lib/campaigns/cost";
import { SAMPLE_SCORE } from "./sample-lead";
import { AppWindow, Chip, Row, SegmentedTabs } from "./product-chrome";
import { BRAND, BRAND_FILL, FG_2, FG_3, FG_4, LINE, R_SM, SURFACE_2, WARN } from "./theme";

/**
 * The three campaign figures: what a human decides, what the run will do, and
 * the queue they work afterwards.
 *
 * These answer the question the old page never answered — where do the leads
 * come from — and they answer it with the app's own screens rather than with
 * prose. Each one is `AppWindow`-framed, so each carries its own provenance
 * line and cannot be mistaken for a measured result.
 *
 * Why built this way, and not as screenshots or as marketing cards:
 *
 *   - Markup stays sharp at any density, reflows at 375px, and costs no image
 *     payload. A screenshot of a dark Fluent table is unreadable on a phone.
 *   - Every string here is either a verbatim app string (checked against
 *     `campaign-form.tsx`, `campaigns/[id]/review/page.tsx`, `review-queue.tsx`
 *     and `draft-panel.tsx`) or sample data for one clinic that the rest of the
 *     page follows. Nothing is a claim about outcomes.
 *   - The cost figure is not typed in. It is computed here by the product's own
 *     `estimateDraftingCost` and printed by its own `formatUsd`, so the figure
 *     cannot drift away from the pricing the app would quote.
 *   - Controls are rendered as spans, never as `<button>`. A figure that is
 *     focusable but inert is a trap for keyboard and screen-reader users: it
 *     promises an action the page cannot perform.
 *
 * Sample clinic followed across the page: Riverbend Family Optometry, scored by the real engine.
 */

/* -------------------------------------------------------------------------- */
/* 1. New campaign                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Labels are the real form's, from `src/components/app/campaign-form.tsx`:
 * "Province / state" and "Search radius (km)" rather than tidier marketing
 * rewrites, because a visitor who signs in should recognise the screen.
 */
const CAMPAIGN_FIELDS: { label: string; value: string; wide?: boolean }[] = [
  { label: "Campaign name", value: "Optometry, London ON", wide: true },
  { label: "Clinic categories", value: "Optometry" },
  { label: "City", value: "London" },
  { label: "Province / state", value: "Ontario" },
  { label: "Country", value: "Canada" },
  { label: "Search radius (km)", value: "5" },
  { label: "Minimum locations", value: "1" },
  { label: "Maximum leads", value: "40" },
  { label: "Excluded keywords", value: "hospital", wide: true },
];

export function CampaignFigure() {
  return (
    <AppWindow screen="New campaign">
      <div style={{ background: "#1a1a1b" }}>
        <div className="px-4 pb-3 pt-4" style={{ borderBottom: `1px solid ${LINE}` }}>
          <h3 className="font-display text-[19px] font-semibold leading-tight text-white">
            New campaign
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 p-4 sm:grid-cols-2">
          {CAMPAIGN_FIELDS.map((f) => (
            <div key={f.label} className={f.wide ? "sm:col-span-2" : undefined}>
              <div className="text-[11.5px] leading-tight" style={{ color: FG_3 }}>
                {f.label}
              </div>
              {/* Input-looking, not an input: nothing here is typeable. */}
              <div
                className="mt-1.5 px-2.5 py-[7px] text-[13px] leading-tight"
                style={{
                  background: SURFACE_2,
                  border: `1px solid ${LINE}`,
                  borderRadius: R_SM,
                  color: FG_2,
                }}
              >
                {f.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppWindow>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Review and launch                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Counts as the pre-flight screen renders them. 40 leads in, 31 draftable, 9
 * skipped — a campaign that asked for 40 and says plainly that nine of them
 * will not be written.
 *
 * `edge` carries the hairlines. Four counts in a 2x2 that becomes a 1x4 need
 * different dividers at each breakpoint, which an inline style object cannot
 * express, so the widths are Tailwind classes and only the colour is inline.
 */
const LAUNCH_TILES: { label: string; value: string; edge: string }[] = [
  { label: "Leads in campaign", value: "40", edge: "" },
  { label: "Will be drafted", value: "31", edge: "border-l" },
  { label: "Will be skipped", value: "9", edge: "border-t sm:border-t-0 sm:border-l" },
  { label: "Already approved", value: "0", edge: "border-t border-l" },
];

/**
 * One model call per draftable lead, priced by the product's own module.
 *
 * `avgPromptChars` is the measured mean the cost tests use for a real drafting
 * prompt, and 900 is `DRAFT_MAX_OUTPUT_TOKENS` from `src/lib/ai/draft.ts`,
 * restated rather than imported so this figure pulls in no server module.
 */
const LAUNCH_COST = estimateDraftingCost({
  leadCount: 31,
  model: "claude-sonnet-5",
  avgPromptChars: 7400,
  maxOutputTokens: 900,
});

export function LaunchFigure() {
  return (
    <AppWindow screen="Review and launch">
      <div style={{ background: "#1a1a1b" }}>
        <div className="px-4 pb-3.5 pt-4">
          <h3 className="font-display text-[19px] font-semibold leading-tight text-white">
            Review and launch
          </h3>
          <p className="mt-1 max-w-[46ch] text-[12.5px] leading-relaxed" style={{ color: FG_3 }}>
            Everything this campaign will do, before it does it. Nothing is sent from here.
          </p>
        </div>

        <div
          className="grid grid-cols-2 sm:grid-cols-4"
          style={{ borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}
        >
          {LAUNCH_TILES.map((t) => (
            <div key={t.label} className={`px-4 py-3 ${t.edge}`} style={{ borderColor: LINE }}>
              <div
                className="font-mono text-[21px] font-semibold leading-none tabular-nums text-white"
              >
                {t.value}
              </div>
              <div className="mt-1.5 text-[11.5px] leading-tight" style={{ color: FG_3 }}>
                {t.label}
              </div>
            </div>
          ))}
        </div>

        <div
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
          style={{ borderBottom: `1px solid ${LINE}` }}
        >
          <span className="text-[12.5px]" style={{ color: FG_3 }}>
            Estimated cost
          </span>
          <span
            className="font-mono text-[17px] font-semibold tabular-nums"
            style={{ color: BRAND }}
          >
            {formatUsd(LAUNCH_COST.totalUsd)}
          </span>
          <span className="text-[11.5px]" style={{ color: FG_4 }}>
            An estimate for drafting {LAUNCH_COST.leadCount} emails.
          </span>
        </div>

        <div className="px-4 py-3.5">
          {/* At rest, and inert: a span, so it is neither focusable nor clickable. */}
          <span
            className="inline-flex items-center px-3 py-[7px] text-[12.5px] font-semibold"
            style={{ background: "#ffffff", color: "#0a0a0b", borderRadius: R_SM }}
          >
            Draft emails
          </span>
        </div>
      </div>
    </AppWindow>
  );
}

/* -------------------------------------------------------------------------- */
/* 3. Review drafts                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The queue, mirroring `src/components/app/review-queue.tsx`: name, status
 * badge, version, warning count, a "No email" marker when there is no public
 * address to draft to, and the overall score on the right.
 *
 * Every sample draft is past v1 because the real queue only prints a version
 * once there is more than one, and a figure should not show a row the app
 * would never draw. Harbour Street carries the "No email" marker: at 9/100
 * with no public address, it is the row that shows the queue admitting a lead
 * it cannot write to, rather than hiding it.
 */
const QUEUE: {
  name: string;
  score: number;
  version: string;
  warnings: number;
  hasEmail: boolean;
  selected?: boolean;
}[] = [
  { name: "Cedar Park Vision Centre", score: 38, version: "v2", warnings: 0, hasEmail: true },
  { name: "Northgate Eye Care", score: 29, version: "v3", warnings: 1, hasEmail: true },
  {
    name: "Riverbend Family Optometry",
    score: SAMPLE_SCORE.overallScore,
    version: "v3",
    warnings: 2,
    hasEmail: true,
    selected: true,
  },
  { name: "Harbour Street Optical", score: 9, version: "v2", warnings: 0, hasEmail: false },
];

const QUEUE_TABS = [
  { label: "Needs review", count: 7 },
  { label: "Blocked", count: 2 },
  { label: "Approved", count: 57 },
  { label: "Rejected", count: 0 },
];

export function QueueFigure() {
  return (
    <AppWindow screen="Review drafts" breadcrumb="Review drafts">
      <div style={{ background: "#1a1a1b" }}>
        <SegmentedTabs tabs={QUEUE_TABS} active={0} />

        <div
          className="flex items-center justify-between gap-3 px-4 py-2 font-mono text-[10px]"
          style={{ borderBottom: `1px solid ${LINE}`, color: FG_4 }}
        >
          <span>7 drafts</span>
          <span>j / k to move</span>
        </div>

        {QUEUE.map((q, i) => (
          <Row key={q.name} first={i === 0} highlight={q.selected}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div
                  className="truncate text-[12.5px] font-semibold"
                  style={{ color: q.selected ? BRAND : "#ffffff" }}
                >
                  {q.name}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Chip tone="brand">In review</Chip>
                  <span className="font-mono text-[10.5px]" style={{ color: FG_4 }}>
                    {q.version}
                  </span>
                  {q.warnings > 0 ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10.5px]"
                      style={{ color: WARN }}
                    >
                      <TriangleAlert aria-hidden className="size-3 shrink-0" />
                      {q.warnings}
                      <span className="sr-only">
                        {q.warnings === 1 ? "review warning" : "review warnings"}
                      </span>
                    </span>
                  ) : null}
                  {!q.hasEmail ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10.5px]"
                      style={{ color: FG_3 }}
                    >
                      <MailX aria-hidden className="size-3 shrink-0" />
                      No email
                    </span>
                  ) : null}
                </div>
              </div>
              <span
                className="shrink-0 font-mono text-[15px] font-semibold tabular-nums"
                style={{ color: FG_2 }}
              >
                {q.score}
                <span className="sr-only"> out of 100</span>
              </span>
            </div>
          </Row>
        ))}

        {/* The approval control, at rest. Admin-only in the app; inert here. */}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3.5"
          style={{ borderTop: `1px solid ${LINE}` }}
        >
          <span
            className="inline-flex items-center px-3 py-[7px] text-[12.5px] font-semibold text-white"
            style={{ background: BRAND_FILL, borderRadius: R_SM }}
          >
            Approve &amp; open in Gmail
          </span>
          <span className="text-[11.5px]" style={{ color: FG_4 }}>
            Takes about 10-20 seconds. Nothing is sent.
          </span>
        </div>
      </div>
    </AppWindow>
  );
}
