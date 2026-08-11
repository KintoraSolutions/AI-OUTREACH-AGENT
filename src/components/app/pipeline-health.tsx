import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline, Gauge } from "@/components/app/charts";

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
  const showTrend = typeof trend === "number" && trend !== 0;
  return (
    <div className="glass flex items-center justify-between gap-2 rounded-[7px] px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">
          {label}
        </p>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[23px] font-semibold leading-none tabular-nums text-foreground">
            {value}
          </span>
          {showTrend ? (
            <span
              className={cn(
                "inline-flex items-center text-[11px] font-medium tabular-nums",
                trend > 0 ? "text-[var(--mint)]" : "text-[var(--red)]",
              )}
            >
              {trend > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(trend)}
            </span>
          ) : null}
        </div>
        {sub ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{sub}</p> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}

/** Small horizontal share bar (0-100%). */
function ShareBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex h-11 w-[78px] items-center">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
        <div className="h-full rounded-full bg-[var(--mint)]" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

/**
 * "Pipeline Health" KPI strip. All values are computed from real, org-scoped
 * data (respecting the test-data toggle) and passed in from the server page.
 */
export function PipelineHealth({ data }: { data: PipelineHealthData }) {
  return (
    <section aria-label="Pipeline health">
      <h2 className="mb-2 text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
        Pipeline Health
      </h2>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Leads" value={data.totalLeads}>
          <Sparkline points={data.totalSeries} className="h-[26px] w-[78px]" />
        </KpiCard>
        <KpiCard
          label="Strong Leads"
          value={data.strongLeads}
          sub={`${Math.round(data.strongShare)}% of pipeline`}
        >
          <ShareBar pct={data.strongShare} />
        </KpiCard>
        <KpiCard label="Stage Conversion" value={`${data.conversion.toFixed(1)}%`}>
          <Gauge value={data.conversion} />
        </KpiCard>
        <KpiCard label="New This Week" value={data.newThisWeek} trend={data.newTrend}>
          <Sparkline points={data.newSeries} className="h-[26px] w-[78px]" />
        </KpiCard>
      </div>
    </section>
  );
}
