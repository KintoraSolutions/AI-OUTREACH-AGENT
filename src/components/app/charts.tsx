import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Compact, dependency-free SVG charts for the dashboard analytics strip.
 * Deliberately muted: green shades only, hairline grid, low-contrast axes.
 * All are pure/server-renderable (no interactivity, no client bundle).
 */

// Muted green shades (lightest -> darkest) + a neutral for "other".
export const GREEN_SHADES = ["#6fd09a", "#4f9e77", "#356f54", "#8bdcae"] as const;
export const NEUTRAL_SHADE = "#3a3b39";

const AXIS = "var(--faint-foreground)";
const GRID = "var(--hairline)";

export interface Datum {
  label: string;
  value: number;
  color?: string;
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex min-h-[130px] items-center justify-center text-[12px] text-muted-foreground">
      {label}
    </div>
  );
}

function truncate(s: string, n = 11) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Vertical bar chart with a percentage axis (Campaign Conversion). */
export function BarChart({
  data,
  unit = "%",
  emptyLabel = "No data yet.",
}: {
  data: Datum[];
  unit?: string;
  emptyLabel?: string;
}) {
  if (!data.length) return <ChartEmpty label={emptyLabel} />;
  const W = 480;
  const H = 210;
  const padL = 30;
  const padR = 10;
  const padT = 18;
  const padB = 52;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const rawMax = Math.max(10, ...data.map((d) => d.value));
  const niceMax = Math.ceil(rawMax / 10) * 10;
  const step = plotW / data.length;
  const barW = Math.min(38, step * 0.6);
  const yFor = (v: number) => padT + plotH - (v / niceMax) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(niceMax * f));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Campaign conversion, bar chart">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={W - padR} y1={yFor(t)} y2={yFor(t)} stroke={GRID} strokeWidth={1} />
          <text x={padL - 6} y={yFor(t) + 3} textAnchor="end" fontSize={9} fill={AXIS}>
            {t}
            {unit}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = padL + i * step + (step - barW) / 2;
        const y = yFor(d.value);
        const h = Math.max(0, padT + plotH - y);
        const cx = x + barW / 2;
        return (
          <g key={d.label + i}>
            <rect x={x} y={y} width={barW} height={h} rx={2} fill="var(--mint)" />
            <text x={cx} y={y - 5} textAnchor="middle" fontSize={9} fill="var(--foreground)">
              {Math.round(d.value)}
              {unit}
            </text>
            <text
              x={cx}
              y={H - padB + 14}
              textAnchor="end"
              fontSize={8.5}
              fill={AXIS}
              transform={`rotate(-28 ${cx} ${H - padB + 14})`}
            >
              {truncate(d.label)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export interface StackSeries {
  label: string;
  color: string;
}

/** Stacked bar chart across periods (Weekly Lead Intake by source). */
export function StackedBarChart({
  data,
  series,
  emptyLabel = "No recent activity.",
}: {
  data: { period: string; values: number[] }[];
  series: StackSeries[];
  emptyLabel?: string;
}) {
  const hasData = data.some((d) => d.values.some((v) => v > 0));
  if (!hasData) return <ChartEmpty label={emptyLabel} />;
  const W = 280;
  const H = 150;
  const padL = 6;
  const padR = 6;
  const padT = 10;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...totals);
  const step = plotW / data.length;
  const barW = Math.min(30, step * 0.5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Weekly lead intake, stacked bar chart">
      {data.map((d, i) => {
        const x = padL + i * step + (step - barW) / 2;
        let cursor = padT + plotH;
        return (
          <g key={d.period + i}>
            {d.values.map((v, si) => {
              const h = (v / max) * plotH;
              cursor -= h;
              return h > 0 ? (
                <rect key={si} x={x} y={cursor} width={barW} height={h} fill={series[si]?.color} rx={1} />
              ) : null;
            })}
            <text x={x + barW / 2} y={H - padB + 13} textAnchor="middle" fontSize={8.5} fill={AXIS}>
              {d.period}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Donut chart (Lead Distribution by Stage). */
export function DonutChart({
  data,
  emptyLabel = "No leads yet.",
}: {
  data: Datum[];
  emptyLabel?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <ChartEmpty label={emptyLabel} />;
  const size = 122;
  const c = size / 2;
  const r = 44;
  const sw = 18;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="size-[112px] shrink-0" role="img" aria-label="Lead distribution by stage, donut chart">
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={sw} />
      {data.map((d, i) => {
        const len = (d.value / total) * circ;
        const el = (
          <circle
            key={d.label + i}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={d.color ?? GREEN_SHADES[i % GREEN_SHADES.length]}
            strokeWidth={sw}
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${c} ${c})`}
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

/** Small spider/radar chart for a lead's five scoring dimensions (0-100). */
export function Radar({
  values,
  size = 64,
  className,
}: {
  values: { label: string; value: number | null }[];
  size?: number;
  className?: string;
}) {
  const n = values.length;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const point = (i: number, frac: number): [number, number] => {
    const a = angle(i);
    return [cx + Math.cos(a) * r * frac, cy + Math.sin(a) * r * frac];
  };
  const grid = [0.34, 0.67, 1].map((f) => values.map((_, i) => point(i, f).join(",")).join(" "));
  const hasAny = values.some((v) => v.value !== null);
  const dataPoly = values
    .map((v, i) => point(i, Math.max(0, Math.min(1, (v.value ?? 0) / 100))).join(","))
    .join(" ");
  const title = values.map((v) => `${v.label} ${v.value ?? "—"}`).join(" · ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Performance profile: ${title}`}
    >
      <title>{title}</title>
      {grid.map((pts, i) => (
        <polygon key={i} points={pts} fill="none" stroke={GRID} strokeWidth={0.75} />
      ))}
      {values.map((_, i) => {
        const [x, y] = point(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} strokeWidth={0.75} />;
      })}
      {hasAny ? (
        <polygon
          points={dataPoly}
          fill="var(--mint)"
          fillOpacity={0.22}
          stroke="var(--mint)"
          strokeWidth={1.25}
          strokeLinejoin="round"
        />
      ) : null}
    </svg>
  );
}

/** Tiny trend sparkline. */
export function Sparkline({
  points,
  width = 78,
  height = 26,
  className,
  stroke = "var(--mint)",
}: {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
  stroke?: string;
}) {
  const pts = points.length >= 2 ? points : [points[0] ?? 0, points[0] ?? 0];
  const max = Math.max(...pts);
  const min = Math.min(...pts);
  const range = max - min || 1;
  const stepX = width / (pts.length - 1);
  const coords = pts.map((p, i): [number, number] => [
    i * stepX,
    height - 2 - ((p - min) / range) * (height - 4),
  ]);
  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} role="img" aria-label="Trend sparkline" preserveAspectRatio="none">
      <path d={area} fill={stroke} fillOpacity={0.12} stroke="none" />
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** Compact bar chart with tiny value labels (entries processed per job). */
export function MiniBars({
  values,
  width = 116,
  height = 40,
  showLabels = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  showLabels?: boolean;
}) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const n = values.length;
  const gap = 3;
  const barW = (width - gap * (n - 1)) / n;
  const labelH = showLabels ? 12 : 0;
  const plotH = height - labelH;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Entries processed per recent job">
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * (plotH - 2));
        const x = i * (barW + gap);
        const y = plotH - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx={1.5} fill="var(--mint)" />
            {showLabels ? (
              <text x={x + barW / 2} y={height - 2} textAnchor="middle" fontSize={8} fill="var(--faint-foreground)">
                {v}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Ring progress with a centered label (e.g. "5/5") for completed campaigns. */
export function ProgressRing({
  pct,
  label,
  size = 54,
}: {
  pct: number;
  label: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const c = size / 2;
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const len = (clamped / 100) * circ;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={`${label} (${clamped.toFixed(0)} percent)`}
    >
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={4} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="var(--mint)"
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={`${len} ${circ - len}`}
        transform={`rotate(-90 ${c} ${c})`}
      />
      <text
        x={c}
        y={c}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.26}
        fontWeight={600}
        fill="var(--mint)"
      >
        {label}
      </text>
    </svg>
  );
}

/** Compact radial gauge for a single percentage (0-100). */
export function Gauge({ value, size = 52 }: { value: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const c = size / 2;
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const len = (pct / 100) * circ;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${pct.toFixed(1)} percent`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={5} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke="var(--mint)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${len} ${circ - len}`}
        transform={`rotate(-90 ${c} ${c})`}
      />
    </svg>
  );
}

/** Compact legend shared by the charts. */
export function ChartLegend({
  items,
  vertical = false,
  showValues = false,
}: {
  items: { label: string; value?: number; color?: string }[];
  vertical?: boolean;
  showValues?: boolean;
}) {
  return (
    <ul
      className={cn(
        "text-[10.5px] text-muted-foreground",
        vertical ? "flex flex-col gap-1.5" : "flex flex-wrap gap-x-3 gap-y-1",
      )}
    >
      {items.map((it, i) => (
        <li key={it.label + i} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-2 shrink-0 rounded-[2px]"
            style={{ background: it.color ?? GREEN_SHADES[i % GREEN_SHADES.length] }}
          />
          <span className="truncate">{it.label}</span>
          {showValues ? <span className="tabular-nums text-[var(--faint-foreground)]">{it.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}
