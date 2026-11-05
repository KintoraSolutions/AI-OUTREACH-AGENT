import { CircleHelp, Monitor, Settings, PanelLeft } from "lucide-react";
import { KatalystMark } from "@/components/brand/katalyst-mark";
import {
  BRAND,
  BRAND_FILL,
  FG_2,
  FG_3,
  FG_4,
  LINE,
  LINE_STRONG,
  R_MD,
  R_SM,
  SURFACE,
  SURFACE_2,
  SURFACE_3,
} from "./theme";

/**
 * Shared chrome for every product visual on the landing page.
 *
 * Everything here is the real app: the same suite header, breadcrumb rail,
 * Fluent surfaces and 4px geometry a signed-in user sees. Rendered as markup
 * rather than a PNG so it stays sharp at any density, costs no image payload,
 * and can carry state where a screenshot could not.
 *
 * Which raises the honesty problem. The page used to assert "Each panel below
 * is a screen from the app" while every panel was hand-built marketing markup
 * with invented rows. That sentence is gone, and `screen` is why it cannot
 * come back: it is REQUIRED, so no product frame can ship without naming what
 * it reproduces and admitting the data is a sample. The caption sits inside
 * the frame's own border, because a figure's provenance belongs to the figure
 * and not to a disclaimer parked in the footer.
 */
export function AppWindow({
  screen,
  breadcrumb,
  children,
  className,
  style,
}: {
  /** What this reproduces, e.g. "Leads". Rendered as provenance, required. */
  screen: string;
  breadcrumb?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      role="figure"
      aria-label={`Rebuilt from the ${screen} screen. Sample data.`}
      className={className}
      style={{
        border: `1px solid ${LINE_STRONG}`,
        borderRadius: R_MD,
        background: SURFACE,
        boxShadow: "0 40px 80px -32px rgba(0,0,0,0.85), 0 2px 8px rgba(0,0,0,0.5)",
        overflow: "hidden",
        ...style,
      }}
    >
      {/* Suite header — the app's own, not a browser or terminal frame. */}
      <div
        className="flex items-center gap-3 px-3"
        style={{ height: 44, borderBottom: `1px solid ${LINE}`, background: "#101011" }}
      >
        <PanelLeft aria-hidden className="size-4 shrink-0" style={{ color: FG_4 }} />
        <div className="flex min-w-0 items-center gap-2">
          <KatalystMark size={18} gradientId="kg-win" />
          <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-white">
            Katalyst
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <CircleHelp aria-hidden className="size-[15px]" style={{ color: FG_4 }} />
          <Monitor aria-hidden className="size-[15px]" style={{ color: FG_4 }} />
          <Settings aria-hidden className="size-[15px]" style={{ color: FG_4 }} />
          <span
            className="grid size-[22px] shrink-0 place-items-center text-[10px] font-semibold text-white"
            style={{ background: BRAND_FILL, borderRadius: "9999px" }}
          >
            TF
          </span>
        </div>
      </div>

      {breadcrumb ? (
        <div
          className="flex items-center gap-1.5 px-4 text-[11px]"
          style={{ height: 30, borderBottom: `1px solid ${LINE}`, color: FG_4 }}
        >
          <span>Dashboard</span>
          <span style={{ opacity: 0.5 }}>›</span>
          <span style={{ color: FG_3 }}>{breadcrumb}</span>
        </div>
      ) : null}

      {children}

      {/* Provenance. Inside the border, because it describes this figure. */}
      <div
        className="px-4 py-2 text-[11px]"
        style={{ borderTop: `1px solid ${LINE}`, background: "#101011", color: FG_4 }}
      >
        Rebuilt from the {screen} screen. Sample data.
      </div>
    </div>
  );
}

/** Fluent-style status pill. `tone` maps onto the app's status triads. */
export function Chip({
  children,
  tone = "neutral",
  mono = false,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "ok" | "warn" | "danger";
  mono?: boolean;
}) {
  const tones = {
    neutral: { bg: SURFACE_3, fg: FG_3, bd: LINE },
    brand: { bg: "#0a2e4a", fg: BRAND, bd: "#0f548c" },
    ok: { bg: "#052505", fg: "#54b054", bd: "#0e700e" },
    warn: { bg: "#332a00", fg: "#f2c661", bd: "#835b00" },
    danger: { bg: "#3b1113", fg: "#f1707b", bd: "#8b2b30" },
  }[tone];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 px-1.5 py-[2px] text-[10.5px] leading-none ${
        mono ? "font-mono" : "font-medium"
      }`}
      style={{
        background: tones.bg,
        color: tones.fg,
        border: `1px solid ${tones.bd}`,
        borderRadius: R_SM,
      }}
    >
      {children}
    </span>
  );
}

/**
 * One scored category, as the lead detail renders it.
 *
 * `label` used to be a three-letter key — WEB, PHO, SW, Con, Fit — which the
 * page then never expanded anywhere, and `max` defaulted to 12, so a meter
 * could be drawn against a cap nobody had stated. Both are now explicit: the
 * category is spelled out, and the denominator has to be passed in.
 */
export function Meter({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[108px] shrink-0 text-[11.5px]" style={{ color: FG_3 }}>
        {label}
      </span>
      <span
        className="w-[34px] shrink-0 text-right font-mono text-[11.5px] tabular-nums"
        style={{ color: FG_2 }}
      >
        {value}
        <span style={{ color: FG_4 }}>/{max}</span>
      </span>
      <span
        className="relative h-[3px] min-w-0 flex-1 overflow-hidden"
        style={{ background: "#3d3d3d", borderRadius: 999 }}
      >
        <span
          className="absolute inset-y-0 left-0 block"
          style={{
            width: `${Math.min(100, (value / max) * 100)}%`,
            background: BRAND,
            borderRadius: 999,
          }}
        />
      </span>
    </div>
  );
}

/**
 * The app's segmented tab rail, as the review queue draws it.
 *
 * Deliberately handler-optional and directive-free: the queue figure renders
 * it inert on the server, while the guard demo imports it into a client
 * subtree and passes `onSelect`. One tab control, drawn once.
 */
export function SegmentedTabs({
  tabs,
  active,
  onSelect,
}: {
  tabs: { label: string; count?: number }[];
  active: number;
  onSelect?: (index: number) => void;
}) {
  return (
    <div
      role={onSelect ? "tablist" : undefined}
      className="flex items-center gap-1 overflow-x-auto px-3"
      style={{ borderBottom: `1px solid ${LINE}` }}
    >
      {tabs.map((t, i) => {
        const on = i === active;
        const content = (
          <>
            {t.label}
            {typeof t.count === "number" ? (
              <span className="ml-1.5 font-mono tabular-nums" style={{ color: FG_4 }}>
                {t.count}
              </span>
            ) : null}
          </>
        );
        const style: React.CSSProperties = {
          color: on ? BRAND : FG_4,
          fontWeight: on ? 600 : 400,
          boxShadow: on ? `inset 0 -2px 0 ${BRAND}` : "none",
        };
        const cls = "relative shrink-0 whitespace-nowrap px-2.5 py-2.5 text-[12px]";

        return onSelect ? (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(i)}
            className={cls}
            style={style}
          >
            {content}
          </button>
        ) : (
          <span key={t.label} className={cls} style={style}>
            {content}
          </span>
        );
      })}
    </div>
  );
}

/** A labelled row inside a product figure: hairlines, never a nested card. */
export function Row({
  children,
  first = false,
  highlight = false,
  className,
}: {
  children: React.ReactNode;
  first?: boolean;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`px-4 py-2.5 ${className ?? ""}`}
      style={{
        borderTop: first ? "none" : `1px solid ${LINE}`,
        background: highlight ? SURFACE_2 : "transparent",
        boxShadow: highlight ? `inset 2px 0 0 ${BRAND}` : "none",
      }}
    >
      {children}
    </div>
  );
}

/** Caption under a figure. 13px, the only text allowed to sit below a mock. */
export function FigureNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 text-[13px] leading-relaxed" style={{ color: FG_3 }}>
      {children}
    </p>
  );
}
