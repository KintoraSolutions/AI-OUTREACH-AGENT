import * as React from "react";
import { cn } from "@/lib/utils";
import type { FigureKey } from "@/lib/tutorial/chapters";

/**
 * Inline schematic illustrations for the tutorial.
 *
 * Hand-rolled SVG in the manner of `charts.tsx`: no image files, no chart
 * library, every colour a Fluent token so the diagrams switch with the theme
 * instead of staying light on a dark canvas.
 *
 * They are deliberately schematic. A fake screenshot goes stale the moment the
 * real screen changes and quietly teaches the wrong thing; a diagram of the
 * MECHANISM stays true, which is what the tutorial is actually explaining.
 *
 * Accessibility: each figure carries `role="img"` and a descriptive
 * `aria-label`, so assistive tech gets the point of the diagram rather than a
 * list of rectangles. The drawing itself is marked `aria-hidden`. Meaning-bearing
 * colour is tagged `data-keep-color`, which globals.css preserves under Windows
 * High Contrast, and every status colour is paired with a word so the diagram
 * never depends on hue alone.
 */

// --- Shared token shorthands -------------------------------------------------

const FACE = "var(--fl-bg-1)";
const SUBTLE = "var(--fl-bg-4)";
const STROKE = "var(--fl-stroke-1)";
const DIVIDER = "var(--fl-stroke-2)";
const FG1 = "var(--fl-fg-1)";
const FG3 = "var(--fl-fg-3)";
const BRAND_FILL = "var(--fl-brand-tint)";
const BRAND_STROKE = "var(--fl-brand-tint-stroke)";
const BRAND_TEXT = "var(--fl-brand-text)";

const TONE = {
  success: { fg: "var(--fl-success-fg)", bg: "var(--fl-success-bg)", stroke: "var(--fl-success-stroke)" },
  warning: { fg: "var(--fl-warning-fg)", bg: "var(--fl-warning-bg)", stroke: "var(--fl-warning-stroke)" },
  danger: { fg: "var(--fl-danger-fg)", bg: "var(--fl-danger-bg)", stroke: "var(--fl-danger-stroke)" },
  info: { fg: "var(--fl-info-fg)", bg: "var(--fl-info-bg)", stroke: "var(--fl-info-stroke)" },
} as const;

type ToneKey = keyof typeof TONE;

// --- Primitives --------------------------------------------------------------

function Box({
  x,
  y,
  w,
  h,
  fill = FACE,
  stroke = STROKE,
  dashed = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
  dashed?: boolean;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={4}
      fill={fill}
      stroke={stroke}
      strokeWidth={1}
      strokeDasharray={dashed ? "4 3" : undefined}
    />
  );
}

function T({
  x,
  y,
  children,
  size = 11,
  fill = FG1,
  weight = 400,
  anchor = "start",
}: {
  x: number;
  y: number;
  children: React.ReactNode;
  size?: number;
  fill?: string;
  weight?: number;
  anchor?: "start" | "middle" | "end";
}) {
  return (
    <text x={x} y={y} fontSize={size} fill={fill} fontWeight={weight} textAnchor={anchor}>
      {children}
    </text>
  );
}

/** A labelled box with a title and an optional caption line. */
function Node({
  x,
  y,
  w,
  h,
  title,
  caption,
  tone,
  brand = false,
  dashed = false,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  caption?: string;
  tone?: ToneKey;
  brand?: boolean;
  dashed?: boolean;
}) {
  const t = tone ? TONE[tone] : null;
  const fill = t ? t.bg : brand ? BRAND_FILL : FACE;
  const stroke = t ? t.stroke : brand ? BRAND_STROKE : STROKE;
  const titleFill = t ? t.fg : brand ? BRAND_TEXT : FG1;
  const cx = x + w / 2;
  return (
    <g data-keep-color={t || brand ? "" : undefined}>
      <Box x={x} y={y} w={w} h={h} fill={fill} stroke={stroke} dashed={dashed} />
      <T x={cx} y={caption ? y + h / 2 - 2 : y + h / 2 + 4} size={11} weight={600} fill={titleFill} anchor="middle">
        {title}
      </T>
      {caption ? (
        <T x={cx} y={y + h / 2 + 13} size={9.5} fill={FG3} anchor="middle">
          {caption}
        </T>
      ) : null}
    </g>
  );
}

/** A horizontal arrow drawn as a line plus a solid head (no marker ids to collide). */
function ArrowR({ x, y, len, label, tone }: { x: number; y: number; len: number; label?: string; tone?: ToneKey }) {
  const end = x + len;
  const color = tone ? TONE[tone].fg : STROKE;
  return (
    <g>
      <line x1={x} y1={y} x2={end - 6} y2={y} stroke={color} strokeWidth={1.25} />
      <polygon points={`${end},${y} ${end - 7},${y - 3.5} ${end - 7},${y + 3.5}`} fill={color} />
      {label ? (
        <T x={x + len / 2} y={y - 6} size={9} fill={tone ? TONE[tone].fg : FG3} anchor="middle" weight={600}>
          {label}
        </T>
      ) : null}
    </g>
  );
}

/** A vertical arrow pointing down. */
function ArrowD({ x, y, len, tone }: { x: number; y: number; len: number; tone?: ToneKey }) {
  const end = y + len;
  const color = tone ? TONE[tone].fg : STROKE;
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={end - 6} stroke={color} strokeWidth={1.25} />
      <polygon points={`${x},${end} ${x - 3.5},${end - 7} ${x + 3.5},${end - 7}`} fill={color} />
    </g>
  );
}

/** A small pill used for chips such as "Fact" or "High". */
function Chip({ x, y, w, label, tone }: { x: number; y: number; w: number; label: string; tone: ToneKey }) {
  const t = TONE[tone];
  return (
    <g data-keep-color="">
      <rect x={x} y={y} width={w} height={14} rx={3} fill={t.bg} stroke={t.stroke} strokeWidth={1} />
      <T x={x + w / 2} y={y + 10} size={8.5} weight={600} fill={t.fg} anchor="middle">
        {label}
      </T>
    </g>
  );
}

/** A check glyph, drawn rather than imported so it inherits the tone colour. */
function Check({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <polyline
      points={`${x},${y} ${x + 3},${y + 3.5} ${x + 8},${y - 4}`}
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/** Placeholder text lines, for mocked-up panels. */
function Lines({
  x,
  y,
  widths,
  gap = 9,
  color = DIVIDER,
}: {
  x: number;
  y: number;
  widths: number[];
  gap?: number;
  color?: string;
}) {
  return (
    <g>
      {widths.map((w, i) => (
        <rect key={i} x={x} y={y + i * gap} width={w} height={4} rx={2} fill={color} />
      ))}
    </g>
  );
}

// --- The figures -------------------------------------------------------------

function Pipeline() {
  const stages = ["Research", "Score", "Draft", "Review", "Approve", "Gmail draft", "You send"];
  const w = 78;
  const gap = 12;
  const y = 34;
  const h = 34;
  return (
    <g aria-hidden="true">
      {stages.map((s, i) => {
        const x = 11 + i * (w + gap);
        const last = i === stages.length - 1;
        return (
          <g key={s}>
            <Node x={x} y={y} w={w} h={h} title={s} brand={last} />
            {i < stages.length - 1 ? <ArrowR x={x + w + 1} y={y + h / 2} len={gap - 2} /> : null}
          </g>
        );
      })}
      {/* Bracket: where the app stops and you take over. */}
      <line x1={11} y1={84} x2={529} y2={84} stroke={DIVIDER} strokeWidth={1} />
      <line x1={11} y1={84} x2={11} y2={90} stroke={DIVIDER} strokeWidth={1} />
      <line x1={529} y1={84} x2={529} y2={90} stroke={DIVIDER} strokeWidth={1} />
      <T x={270} y={102} size={9.5} fill={FG3} anchor="middle">
        Performed by the app
      </T>
      <line x1={551} y1={84} x2={618} y2={84} stroke={BRAND_STROKE} strokeWidth={1} />
      <line x1={551} y1={84} x2={551} y2={90} stroke={BRAND_STROKE} strokeWidth={1} />
      <line x1={618} y1={84} x2={618} y2={90} stroke={BRAND_STROKE} strokeWidth={1} />
      <T x={584} y={102} size={9.5} fill={BRAND_TEXT} anchor="middle" weight={600}>
        Performed by you
      </T>
      <T x={11} y={20} size={11} weight={600} fill={FG1}>
        The seven stages
      </T>
    </g>
  );
}

function AiProfile() {
  return (
    <g aria-hidden="true">
      <Node
        x={30}
        y={22}
        w={225}
        h={58}
        title="Preset safety rules"
        caption="Always on. You cannot remove them."
      />
      <Node
        x={305}
        y={22}
        w={225}
        h={58}
        title="Your custom rules"
        caption="Extra restrictions you write."
        brand
      />
      <ArrowD x={142} y={84} len={34} />
      <ArrowD x={417} y={84} len={34} />
      <T x={280} y={107} size={9.5} fill={FG3} anchor="middle">
        added together
      </T>
      <Node
        x={30}
        y={122}
        w={500}
        h={54}
        title="The rules applied to every draft"
        caption="Additive only. A custom rule can forbid more, never permit more."
        tone="info"
      />
    </g>
  );
}

function LeadSources() {
  const rows = [
    { label: "New lead", note: "no findings, no score", tone: "warning" as ToneKey },
    { label: "Import CSV", note: "no findings, no score", tone: "warning" as ToneKey },
    { label: "Research campaign", note: "findings and a score", tone: "success" as ToneKey },
  ];
  return (
    <g aria-hidden="true">
      {rows.map((r, i) => {
        const y = 22 + i * 58;
        return (
          <g key={r.label}>
            <Node x={16} y={y} w={168} h={42} title={r.label} />
            <ArrowR x={186} y={y + 21} len={136} label={r.note} tone={r.tone} />
          </g>
        );
      })}
      <Box x={326} y={22} w={214} h={156} />
      <T x={433} y={44} size={11} weight={600} anchor="middle">
        Your leads list
      </T>
      <line x1={340} y1={54} x2={526} y2={54} stroke={DIVIDER} strokeWidth={1} />
      {[0, 1, 2].map((i) => {
        const y = 66 + i * 34;
        const scored = i === 2;
        return (
          <g key={i}>
            <Lines x={340} y={y} widths={[96]} />
            <Lines x={340} y={y + 10} widths={[64]} />
            {scored ? (
              <Chip x={462} y={y - 4} w={64} label="Scored 71" tone="success" />
            ) : (
              <Chip x={462} y={y - 4} w={64} label="Not scored" tone="warning" />
            )}
          </g>
        );
      })}
    </g>
  );
}

function CampaignRun() {
  const steps = [
    { title: "Criteria", caption: "area, categories" },
    { title: "Discover", caption: "find clinics" },
    { title: "Research", caption: "one by one" },
    { title: "Findings", caption: "plus a score" },
  ];
  const w = 118;
  const gap = 18;
  return (
    <g aria-hidden="true">
      {steps.map((s, i) => {
        const x = 16 + i * (w + gap);
        return (
          <g key={s.title}>
            <Node
              x={x}
              y={30}
              w={w}
              h={54}
              title={s.title}
              caption={s.caption}
              tone={i === 3 ? "success" : undefined}
            />
            {i < steps.length - 1 ? <ArrowR x={x + w + 2} y={57} len={gap - 4} /> : null}
          </g>
        );
      })}
      <Box x={16} y={110} w={524} h={62} fill={SUBTLE} stroke={DIVIDER} />
      <T x={30} y={130} size={10.5} weight={600} fill={FG1}>
        Research jobs
      </T>
      <T x={30} y={146} size={9.5} fill={FG3}>
        Every run appears here with its status, progress, entries processed, and any errors.
      </T>
      <T x={30} y={161} size={9.5} fill={FG3}>
        One clinic failing does not stop the run.
      </T>
      <Chip x={452} y={122} w={74} label="Admin only" tone="info" />
    </g>
  );
}

function ScoreBreakdown() {
  const cats = [
    { label: "Website", cap: 30 },
    { label: "Software", cap: 25 },
    { label: "Phone ops", cap: 25 },
    { label: "Contact", cap: 10 },
    { label: "Fit", cap: 10 },
  ];
  const x0 = 24;
  const total = 480;
  let cursor = x0;
  return (
    <g aria-hidden="true">
      <T x={x0} y={24} size={11} weight={600} fill={FG1}>
        Five capped categories, adding to 100
      </T>
      {cats.map((c, i) => {
        const w = (c.cap / 100) * total;
        const x = cursor;
        cursor += w;
        const shade = i === 0 ? BRAND_FILL : SUBTLE;
        return (
          <g key={c.label}>
            <rect
              x={x}
              y={38}
              width={w - 2}
              height={36}
              rx={3}
              fill={shade}
              stroke={i === 0 ? BRAND_STROKE : STROKE}
              strokeWidth={1}
            />
            <T x={x + (w - 2) / 2} y={54} size={10} weight={600} fill={i === 0 ? BRAND_TEXT : FG1} anchor="middle">
              {c.label}
            </T>
            <T x={x + (w - 2) / 2} y={67} size={9.5} fill={FG3} anchor="middle">
              cap {c.cap}
            </T>
          </g>
        );
      })}
      {/* The two gates */}
      <T x={x0} y={104} size={11} weight={600} fill={FG1}>
        How one finding becomes points
      </T>
      <Node x={x0} y={116} w={140} h={46} title="Finding" caption="with a confidence" />
      <ArrowR x={x0 + 142} y={139} len={38} label="gate 1" />
      <Node
        x={x0 + 182}
        y={116}
        w={146}
        h={46}
        title="Meets the rule's"
        caption="minimum confidence?"
      />
      <ArrowR x={x0 + 330} y={139} len={38} label="gate 2" />
      <Node
        x={x0 + 370}
        y={116}
        w={134}
        h={46}
        title="Points scaled"
        caption="by confidence"
        tone="success"
      />
      <T x={x0} y={180} size={9.5} fill={FG3}>
        Below the bar contributes zero and is listed as rejected. Above it: verified counts in full,
      </T>
      <T x={x0} y={194} size={9.5} fill={FG3}>
        strong inference three quarters, weak inference half, unknown nothing.
      </T>
    </g>
  );
}

function TwoStageDraft() {
  return (
    <g aria-hidden="true">
      <Node x={16} y={62} w={126} h={56} title="Stage A" caption="code picks the angle" />
      <ArrowR x={144} y={90} len={30} />
      <Node x={176} y={62} w={116} h={56} title="Enough" caption="evidence?" tone="info" />
      {/* Yes branch */}
      <ArrowR x={294} y={78} len={34} label="yes" tone="success" />
      <Node x={330} y={50} w={116} h={52} title="Stage B" caption="model writes it" brand />
      <ArrowR x={448} y={76} len={26} />
      <Node x={476} y={50} w={68} h={52} title="Guard" caption="re-checks" tone="success" />
      {/* No branch */}
      <line x1={234} y1={120} x2={234} y2={150} stroke={TONE.danger.fg} strokeWidth={1.25} />
      <line x1={234} y1={150} x2={324} y2={150} stroke={TONE.danger.fg} strokeWidth={1.25} />
      <polygon points={`331,150 324,146.5 324,153.5`} fill={TONE.danger.fg} />
      <T x={244} y={140} size={9} weight={600} fill={TONE.danger.fg}>
        no
      </T>
      <Node x={333} y={128} w={211} h={46} title="Blocked" caption="the model is never called" tone="danger" />
      <T x={16} y={30} size={11} weight={600} fill={FG1}>
        Two stages, and a branch that never reaches the model
      </T>
      <T x={16} y={46} size={9.5} fill={FG3}>
        With no defensible angle the app stops rather than inventing one.
      </T>
    </g>
  );
}

function DraftPanel() {
  return (
    <g aria-hidden="true">
      {/* The email */}
      <Box x={16} y={20} w={258} h={172} />
      <T x={30} y={40} size={10.5} weight={600} fill={FG1}>
        The email
      </T>
      <rect x={30} y={50} width={230} height={18} rx={3} fill={SUBTLE} stroke={DIVIDER} strokeWidth={1} />
      <T x={38} y={63} size={9} fill={FG3}>
        Subject line
      </T>
      <Lines x={30} y={82} widths={[228, 214, 232, 196, 220, 168]} gap={12} />
      <T x={30} y={172} size={9} fill={FG3}>
        The least interesting part of this panel.
      </T>

      {/* The evidence */}
      <Box x={288} y={20} w={256} h={172} />
      <T x={302} y={40} size={10.5} weight={600} fill={FG1}>
        The evidence behind it
      </T>
      {[
        { text: "No online booking action", tone: "success" as ToneKey, chip: "Fact", w: 34 },
        { text: "Intake appears call-first", tone: "warning" as ToneKey, chip: "Inference", w: 52 },
        { text: "Two booking systems", tone: "success" as ToneKey, chip: "Fact", w: 34 },
      ].map((e, i) => {
        const y = 52 + i * 32;
        return (
          <g key={e.text}>
            <line x1={302} y1={y} x2={530} y2={y} stroke={DIVIDER} strokeWidth={1} />
            <T x={302} y={y + 14} size={9.5} fill={FG1}>
              {e.text}
            </T>
            <Chip x={302} y={y + 18} w={e.w} label={e.chip} tone={e.tone} />
            <T x={302 + e.w + 8} y={y + 29} size={8.5} fill={BRAND_TEXT}>
              source link
            </T>
          </g>
        );
      })}
      <line x1={302} y1={150} x2={530} y2={150} stroke={DIVIDER} strokeWidth={1} />
      <T x={302} y={166} size={9.5} fill={FG3}>
        Confidence
      </T>
      <Chip x={358} y={155} w={34} label="72" tone="info" />
      <T x={400} y={166} size={8.5} fill={FG3}>
        evidence quality, not reply odds
      </T>
    </g>
  );
}

function ApprovalFlow() {
  const guards = [
    "Approved and unchanged",
    "Has a recipient address",
    "Address is valid",
    "Not marked do not contact",
    "Not on the suppression list",
    "No unsubscribe record",
    "Google account connected",
  ];
  return (
    <g aria-hidden="true">
      <Node x={16} y={78} w={118} h={52} title="Approve" caption="Admin only" brand />
      <ArrowR x={136} y={104} len={26} />
      <Box x={164} y={20} w={218} h={168} fill={SUBTLE} stroke={DIVIDER} />
      <T x={178} y={38} size={10.5} weight={600} fill={FG1}>
        Seven checks
      </T>
      {guards.map((g, i) => (
        <g key={g}>
          <Check x={178} y={52 + i * 19} color={TONE.success.fg} />
          <T x={194} y={56 + i * 19} size={9} fill={FG1}>
            {g}
          </T>
        </g>
      ))}
      <ArrowR x={384} y={104} len={26} />
      <Node x={412} y={52} w={132} h={52} title="Gmail draft" caption="created, not sent" tone="success" />
      <ArrowD x={478} y={106} len={26} />
      <Node x={412} y={134} w={132} h={52} title="You press Send" caption="in Gmail, yourself" brand />
      <T x={16} y={148} size={9} fill={FG3}>
        The first failing
      </T>
      <T x={16} y={160} size={9} fill={FG3}>
        check is the one
      </T>
      <T x={16} y={172} size={9} fill={FG3}>
        reported. Approval
      </T>
      <T x={16} y={184} size={9} fill={FG3}>
        still stands.
      </T>
    </g>
  );
}

function FollowUps() {
  const rows = [
    { when: "Mon 14 Oct", who: "Assigned to you", tone: "danger" as ToneKey, label: "High", w: 30, cal: true },
    { when: "Thu 17 Oct", who: "Assigned to Sam", tone: "warning" as ToneKey, label: "Medium", w: 44, cal: false },
    { when: "Fri 25 Oct", who: "Unassigned", tone: "info" as ToneKey, label: "Low", w: 28, cal: true },
  ];
  return (
    <g aria-hidden="true">
      <Box x={16} y={20} w={340} h={168} />
      <T x={30} y={40} size={10.5} weight={600} fill={FG1}>
        Follow-ups on this lead
      </T>
      {rows.map((r, i) => {
        const y = 52 + i * 44;
        return (
          <g key={r.when}>
            <line x1={30} y1={y} x2={342} y2={y} stroke={DIVIDER} strokeWidth={1} />
            <T x={30} y={y + 16} size={10} weight={600} fill={FG1}>
              {r.when}
            </T>
            <T x={30} y={y + 30} size={9} fill={FG3}>
              {r.who}
            </T>
            <Chip x={222} y={y + 6} w={r.w} label={r.label} tone={r.tone} />
            {r.cal ? <Chip x={264 + r.w - 30} y={y + 6} w={66} label="On calendar" tone="success" /> : null}
          </g>
        );
      })}
      <Node
        x={372}
        y={52}
        w={172}
        h={58}
        title="Google Calendar"
        caption="optional, needs a connection"
      />
      <T x={372} y={132} size={9.5} fill={FG3}>
        Without a connection the
      </T>
      <T x={372} y={146} size={9.5} fill={FG3}>
        follow-up still works, it just
      </T>
      <T x={372} y={160} size={9.5} fill={FG3}>
        stays inside the app.
      </T>
    </g>
  );
}

function SafetyLayers() {
  const layers = [
    { label: "Roles", note: "who may approve, research, and change settings" },
    { label: "Do not contact", note: "a switch on one lead, which also suppresses its email" },
    { label: "Suppression list", note: "organization-wide, by address or whole domain" },
    { label: "Data retention", note: "a window you set, purged only when you press the button" },
    { label: "Compliance", note: "the acknowledgement recorded before outreach" },
  ];
  return (
    <g aria-hidden="true">
      <T x={16} y={24} size={11} weight={600} fill={FG1}>
        Five separate protections, each doing one job
      </T>
      {layers.map((l, i) => {
        const y = 36 + i * 32;
        return (
          <g key={l.label}>
            <rect
              x={16}
              y={y}
              width={528}
              height={26}
              rx={4}
              fill={i === 1 || i === 2 ? BRAND_FILL : FACE}
              stroke={i === 1 || i === 2 ? BRAND_STROKE : STROKE}
              strokeWidth={1}
            />
            <T x={30} y={y + 17} size={10} weight={600} fill={i === 1 || i === 2 ? BRAND_TEXT : FG1}>
              {l.label}
            </T>
            <T x={168} y={y + 17} size={9.5} fill={FG3}>
              {l.note}
            </T>
          </g>
        );
      })}
    </g>
  );
}

// --- Registry ----------------------------------------------------------------

interface FigureSpec {
  viewBox: string;
  label: string;
  render: () => React.ReactNode;
}

const FIGURES: Record<FigureKey, FigureSpec> = {
  pipeline: {
    viewBox: "0 0 640 112",
    label:
      "Diagram: the seven stages, research, score, draft, review, approve, Gmail draft, and finally you send. The app performs the first six. You perform the send yourself.",
    render: () => <Pipeline />,
  },
  "ai-profile": {
    viewBox: "0 0 560 190",
    label:
      "Diagram: the preset safety rules and your own custom rules are added together to form the rules applied to every draft. Custom rules are additive only, so they can forbid more but never permit more.",
    render: () => <AiProfile />,
  },
  "lead-sources": {
    viewBox: "0 0 560 196",
    label:
      "Diagram: three routes into the leads list. A new lead typed by hand and a CSV import both arrive with no findings and no score. Only a research campaign produces findings and a score.",
    render: () => <LeadSources />,
  },
  "campaign-run": {
    viewBox: "0 0 560 186",
    label:
      "Diagram: a campaign runs from criteria, to discovering clinics, to researching each one, to findings and a score. Every run is listed on the Research jobs page, and running research is an admin action.",
    render: () => <CampaignRun />,
  },
  "score-breakdown": {
    viewBox: "0 0 560 204",
    label:
      "Diagram: five capped scoring categories adding to one hundred, website thirty, software twenty-five, phone operations twenty-five, contactability ten, business fit ten. Below it, a finding passes two gates: the rule's minimum confidence, then a multiplier that scales its points by evidence quality.",
    render: () => <ScoreBreakdown />,
  },
  "two-stage-draft": {
    viewBox: "0 0 560 186",
    label:
      "Diagram: Stage A is code and picks the angle. If there is enough evidence, Stage B calls the model to write the email and a guard re-checks it. If there is not enough evidence the draft is blocked and the model is never called.",
    render: () => <TwoStageDraft />,
  },
  "draft-panel": {
    viewBox: "0 0 560 204",
    label:
      "Diagram: the draft panel. On the left the email with its subject and body. On the right the evidence behind it, each observation tagged as a fact or an inference with a source link, and a confidence number that measures evidence quality rather than the odds of a reply.",
    render: () => <DraftPanel />,
  },
  "approval-flow": {
    viewBox: "0 0 560 200",
    label:
      "Diagram: approving is admin only and runs seven checks, that the draft is approved and unchanged, has a valid recipient address, is not marked do not contact, is not suppressed, has no unsubscribe record, and that a Google account is connected. Passing creates a Gmail draft, which you then send yourself.",
    render: () => <ApprovalFlow />,
  },
  "follow-ups": {
    viewBox: "0 0 560 196",
    label:
      "Diagram: follow-ups listed on a lead, each with a date, an assignee, and a priority of high, medium, or low. Adding one to Google Calendar is optional and needs a connection.",
    render: () => <FollowUps />,
  },
  "safety-layers": {
    viewBox: "0 0 560 196",
    label:
      "Diagram: five separate protections. Roles, do not contact on a single lead, the organization-wide suppression list, a data retention window purged only on request, and the compliance acknowledgement.",
    render: () => <SafetyLayers />,
  },
};

export function TutorialFigure({ figure, className }: { figure: FigureKey; className?: string }) {
  const spec = FIGURES[figure];
  return (
    <svg
      viewBox={spec.viewBox}
      role="img"
      aria-label={spec.label}
      className={cn("h-auto w-full", className)}
      preserveAspectRatio="xMidYMid meet"
    >
      {spec.render()}
    </svg>
  );
}
