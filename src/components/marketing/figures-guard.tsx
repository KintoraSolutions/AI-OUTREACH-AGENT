"use client";

import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { AppWindow, Chip, FigureNote, Row, SegmentedTabs } from "./product-chrome";
import { DANGER, FG_2, FG_3, FG_4, R_SM } from "./theme";

/**
 * The two figures that carry the guard argument.
 *
 * `FabricatedSentence` is the problem, stated once at display size and with no
 * app chrome whatsoever. At that point on the page the visitor has not been
 * shown the product yet, so a framed window would read as "Katalyst wrote
 * this" — the precise opposite of the claim. It is a sentence on the page,
 * nothing more, with the one unsupportable clause marked.
 *
 * `GuardDemo` is the same sentence inside the real review queue, where
 * `validateDraft` has already refused it. It reproduces the Review drafts
 * screen: the Needs review / Blocked tabs, the per-draft meta line the app
 * renders (confidence out of 100, version, word count) and the destructive
 * alert that stands between a fabricated claim and an approval.
 *
 * Two deliberate choices:
 *
 *  - It opens on Blocked, not on the first tab. A visitor who never touches
 *    the control still sees the refusal, which is the whole point; the clean
 *    draft is the reward for interacting, not the default.
 *  - Both panels share one explicit min-height, so switching tabs moves no
 *    pixel below the figure. A product figure that jumps while you read it
 *    undercuts the claim that the product is careful.
 *
 * "use client" sits at the file head because `GuardDemo` is the only stateful
 * thing on the page; `FabricatedSentence` is static and ships no handlers.
 *
 * Sample data follows the one clinic the page follows throughout, Riverbend
 * Family Optometry. The marked clause is backed by no finding anywhere in the
 * page's evidence, which is why it is the one the guard catches.
 */

/** The clause no finding supports. Shared so both figures cannot drift. */
const UNSUPPORTED = "trusted by 200+ clinics across Ontario";

const SENTENCE_LEAD = "Hi, I noticed Riverbend takes bookings by phone only, and we are ";

/**
 * The marked clause.
 *
 * `boxDecorationBreak: clone` keeps the tint and the rule drawn on every line
 * fragment, and the word-break properties are pinned to their non-breaking
 * values so the mark can wrap between words but never mid-word, at any width.
 */
function UnsupportedClaim({ className }: { className?: string }) {
  return (
    <mark
      className={className}
      style={{
        background: "rgba(241,112,123,0.16)",
        color: "#ffc9ce",
        borderBottom: `1px solid ${DANGER}`,
        borderRadius: 0,
        wordBreak: "normal",
        overflowWrap: "normal",
        hyphens: "none",
        WebkitBoxDecorationBreak: "clone",
        boxDecorationBreak: "clone",
      }}
    >
      {UNSUPPORTED}
    </mark>
  );
}

/**
 * The problem, before the product appears.
 *
 * One sentence an AI outreach tool would happily send, with the part the
 * prospect can disprove marked.
 */
export function FabricatedSentence() {
  return (
    <div>
      <p
        className="max-w-[46ch] text-[24px] tracking-[-0.01em] sm:text-[30px]"
        style={{ color: FG_2, lineHeight: 1.35 }}
      >
        {SENTENCE_LEAD}
        <UnsupportedClaim className="px-1" />.
      </p>
      <FigureNote>The clinic never said that, and the clinic can check.</FigureNote>
    </div>
  );
}

type DraftView = {
  tab: string;
  version: string;
  confidence: number;
  words: number;
  blocked: boolean;
};

const BLOCKED_VIEW: DraftView = {
  tab: "Blocked",
  version: "v2",
  confidence: 32,
  words: 136,
  blocked: true,
};

const CLEAN_VIEW: DraftView = {
  tab: "Needs review",
  version: "v3",
  confidence: 61,
  words: 118,
  blocked: false,
};

const TABS = [
  { label: CLEAN_VIEW.tab, count: 7 },
  { label: BLOCKED_VIEW.tab, count: 2 },
];

/** The per-draft meta line, exactly the three fields the app shows. */
function DraftMeta({ view }: { view: DraftView }) {
  const fields: [string, string][] = [
    ["Confidence", `${view.confidence}/100`],
    ["Version", view.version],
    ["Length", `${view.words} words`],
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {fields.map(([label, value]) => (
        <span key={label} className="flex items-baseline gap-1.5 text-[11.5px]">
          <span style={{ color: FG_4 }}>{label}</span>
          <span className="font-mono tabular-nums" style={{ color: FG_2 }}>
            {value}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The review queue, stopped on a draft it will not let through.
 *
 * The only interactive figure on the page: the tabs swap the draft body so a
 * visitor can see both the refusal and what the draft looks like once the
 * claim is gone.
 */
export function GuardDemo() {
  const [active, setActive] = useState(1);
  const view = active === 0 ? CLEAN_VIEW : BLOCKED_VIEW;

  return (
    <AppWindow screen="Review drafts" breadcrumb="Review drafts">
      <SegmentedTabs tabs={TABS} active={active} onSelect={setActive} />

      <div
        role="tabpanel"
        aria-label={`${view.tab} draft for Riverbend Family Optometry`}
        className="min-h-[348px] sm:min-h-[292px]"
      >
        <Row first>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-semibold text-white">
              Draft - {view.version}
            </span>
            {view.blocked ? (
              <Chip tone="danger" mono>
                Blocked
              </Chip>
            ) : (
              <Chip tone="brand" mono>
                In review
              </Chip>
            )}
          </div>
        </Row>

        <Row>
          <DraftMeta view={view} />
        </Row>

        <Row>
          <p className="text-[12.5px] leading-relaxed" style={{ color: FG_2 }}>
            {view.blocked ? (
              <>
                {SENTENCE_LEAD}
                <UnsupportedClaim className="px-0.5" />.
              </>
            ) : (
              "Hi, I noticed Riverbend takes bookings by phone only."
            )}
          </p>
        </Row>

        {view.blocked ? (
          <>
            <Row>
              <div
                className="flex items-start gap-2.5 p-3"
                style={{
                  background: "#3b1113",
                  border: "1px solid #8b2b30",
                  borderRadius: R_SM,
                }}
              >
                <CircleAlert
                  aria-hidden
                  className="mt-px size-4 shrink-0"
                  style={{ color: DANGER }}
                />
                <div className="min-w-0">
                  {/* Title and body are the app's own: draft-panel.tsx renders
                      "Draft blocked" over the guard's blockedReason verbatim
                      (draft-guard.ts:178). An earlier version of this figure
                      invented both, plus a claims-accounting chip row the
                      product does not have. */}
                  <div className="text-[12.5px] font-semibold" style={{ color: DANGER }}>
                    Draft blocked
                  </div>
                  <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: FG_3 }}>
                    A claim cites evidence that does not exist or is not sufficiently supported
                    (kq_phone_response_complaints).
                  </p>
                </div>
              </div>
            </Row>
          </>
        ) : null}
      </div>
    </AppWindow>
  );
}
