"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline, Gauge } from "@/components/app/charts";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface PipelineHealthData {
  totalLeads: number;
  totalSeries: number[];
  strongLeads: number;
  strongShare: number; // 0-100
  conversion: number; // 0-100
  newThisWeek: number;
  newSeries: number[];
  newTrend: number; // delta vs previous week
}

const STORAGE_KEY = "leads.pipelineHealth.open";
const PANEL_ID = "pipeline-health-detail";

/**
 * Trend delta. The arrow is decorative; the sign is also spelled out for
 * assistive tech so the direction never rests on the glyph or the color.
 */
function Trend({ value }: { value: number }) {
  if (value === 0) return null;
  const up = value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-caption1 font-semibold tabular-nums",
        up ? "text-[var(--fl-success-fg)]" : "text-[var(--fl-danger-fg)]",
      )}
    >
      {up ? (
        <ArrowUpRight className="size-3.5 fl-keep-color" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="size-3.5 fl-keep-color" aria-hidden="true" />
      )}
      {Math.abs(value)}
      <span className="sr-only">{up ? "more than last week" : "fewer than last week"}</span>
    </span>
  );
}

/** One figure in the collapsed summary line. */
function InlineStat({
  label,
  value,
  trend,
}: {
  label: string;
  value: string | number;
  trend?: number;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-caption1 text-[var(--fl-fg-3)]">{label}</dt>
      <dd className="flex items-baseline gap-1 text-body1 font-semibold tabular-nums text-[var(--fl-fg-1)]">
        {value}
        {typeof trend === "number" ? <Trend value={trend} /> : null}
      </dd>
    </div>
  );
}

/** One card in the expanded panel. */
function KpiCard({
  label,
  value,
  sub,
  trend,
  children,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: number;
  children?: React.ReactNode;
}) {
  return (
    <Card
      elevation="flat"
      className="flex items-center justify-between gap-3 bg-[var(--fl-bg-2)] px-3 py-2.5"
    >
      <div className="min-w-0">
        <p className="truncate text-caption1 font-semibold text-[var(--fl-fg-3)]">{label}</p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-title3 font-semibold leading-none tabular-nums text-[var(--fl-fg-1)]">
            {value}
          </span>
          {typeof trend === "number" ? <Trend value={trend} /> : null}
        </div>
        {sub ? <p className="mt-1 truncate text-caption1 text-[var(--fl-fg-2)]">{sub}</p> : null}
      </div>
      {children ? (
        <div className="shrink-0" aria-hidden="true">
          {children}
        </div>
      ) : null}
    </Card>
  );
}

/** Share of the pipeline, drawn as a length rather than as a hue. */
function ShareBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex h-10 w-[72px] items-center">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--fl-bg-4)]">
        <div
          className="h-full rounded-full bg-[var(--fl-brand)] fl-keep-color"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Pipeline health.
 *
 * Collapsed by default to a single 36px summary line so the lead table clears
 * the fold; expanding reveals the trend charts. The choice is remembered per
 * browser.
 *
 * These figures are scoped to the whole organization (respecting only the
 * test-data toggle), NOT to the filters applied to the table below, so the
 * strip says so out loud instead of silently disagreeing with the table.
 */
export function PipelineHealth({ data }: { data: PipelineHealthData }) {
  const [open, setOpen] = React.useState(false);

  // Read the remembered state after hydration: the server has no access to
  // localStorage, so reading it during render would desync the two trees.
  React.useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") setOpen(true);
    } catch {
      /* private mode / blocked storage: the default is fine */
    }
  }, []);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* non-persistent is acceptable */
      }
      return next;
    });
  }

  return (
    <section
      aria-label="Pipeline health"
      className="rounded-md border border-[var(--hairline)] bg-[var(--fl-bg-1)] shadow-2"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2.5 py-2">
        <h2 className="m-0">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            aria-controls={PANEL_ID}
            className="-mx-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-body1 font-semibold text-[var(--fl-fg-1)] transition-colors duration-100 ease-[var(--ease-easy)] hover:bg-[var(--fl-subtle-hover)]"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0 text-[var(--fl-fg-3)] transition-transform duration-200 ease-[var(--ease-decelerate)]",
                open && "rotate-90",
              )}
            />
            Pipeline health
          </button>
        </h2>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="What does pipeline health count?"
              className="inline-flex cursor-help items-center gap-1 rounded-md px-1 py-0.5 text-caption1 text-[var(--fl-fg-3)] transition-colors hover:bg-[var(--fl-subtle-hover)] hover:text-[var(--fl-fg-2)]"
            >
              <Info className="size-3.5 shrink-0" aria-hidden="true" />
              Whole pipeline
            </button>
          </TooltipTrigger>
          <TooltipContent>
            These figures cover every lead in the organization. They are deliberately not narrowed by
            the filters applied to the table below.
          </TooltipContent>
        </Tooltip>

        {!open ? (
          <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 sm:ml-auto">
            <InlineStat label="Total" value={data.totalLeads} />
            <InlineStat
              label="Strong"
              value={`${data.strongLeads} (${Math.round(data.strongShare)}%)`}
            />
            <InlineStat label="Contacted" value={`${data.conversion.toFixed(1)}%`} />
            <InlineStat label="New this week" value={data.newThisWeek} trend={data.newTrend} />
          </dl>
        ) : null}
      </div>

      {open ? (
        <div
          id={PANEL_ID}
          className="grid grid-cols-1 gap-2.5 border-t border-[var(--hairline)] p-2.5 duration-150 animate-in fade-in-0 slide-in-from-top-2 sm:grid-cols-2 lg:grid-cols-4"
        >
          <KpiCard label="Total leads" value={data.totalLeads}>
            <Sparkline points={data.totalSeries} className="h-[26px] w-[72px]" />
          </KpiCard>
          <KpiCard
            label="Strong leads"
            value={data.strongLeads}
            sub={`${Math.round(data.strongShare)}% of pipeline, scoring 70 or above`}
          >
            <ShareBar pct={data.strongShare} />
          </KpiCard>
          <KpiCard
            label="Reached contact"
            value={`${data.conversion.toFixed(1)}%`}
            sub="Contacted, replied or booked"
          >
            <Gauge value={data.conversion} />
          </KpiCard>
          <KpiCard
            label="New this week"
            value={data.newThisWeek}
            trend={data.newTrend}
            sub="Last 8 weeks of intake"
          >
            <Sparkline points={data.newSeries} className="h-[26px] w-[72px]" />
          </KpiCard>
        </div>
      ) : null}
    </section>
  );
}
