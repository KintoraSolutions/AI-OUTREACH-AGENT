import { CircleAlert, ChevronDown, TriangleAlert } from "lucide-react";
import {
  describeFailureTotals,
  summarizeFailures,
  type FailureImpact,
  type RawFailure,
} from "@/lib/research/failure-reasons";

/**
 * What went wrong in a research run, in language that says what it cost you.
 *
 * This replaces a list of raw thrown messages — Prisma invocations, Postgres
 * error codes, provider status lines — which told an operator nothing about the
 * lead and nothing about what to do next.
 *
 * The distinction the old list could not make: a failed speed test still saves
 * the clinic, while a failed insert loses it. Grouping both under "issues
 * logged" made a healthy run look broken, so lost leads are separated from
 * leads that were merely saved with less evidence, and sorted first.
 *
 * The raw message is still reachable, one disclosure deeper, because when
 * something genuinely unexpected happens the real text is what helps.
 */

const IMPACT_STYLE: Record<FailureImpact, { fg: string; bg: string; stroke: string }> = {
  lead_lost: {
    fg: "var(--fl-danger-fg)",
    bg: "var(--fl-danger-bg)",
    stroke: "var(--fl-danger-stroke)",
  },
  partial: {
    fg: "var(--fl-warning-fg)",
    bg: "var(--fl-warning-bg)",
    stroke: "var(--fl-warning-stroke)",
  },
  skipped: {
    fg: "var(--fl-fg-3)",
    bg: "var(--fl-bg-4)",
    stroke: "var(--fl-stroke-2)",
  },
};

export function JobIssues({
  failures,
  totalCount,
}: {
  failures: RawFailure[];
  /** The job's full error count, which may exceed the rows fetched. */
  totalCount: number;
}) {
  if (failures.length === 0) return null;

  const groups = summarizeFailures(failures);
  const headline = describeFailureTotals(groups);
  const anyLost = groups.some((g) => g.impact === "lead_lost");
  const style = IMPACT_STYLE[anyLost ? "lead_lost" : "partial"];
  const notShown = totalCount - failures.length;

  return (
    <details
      className="group mt-3 overflow-hidden rounded-md border"
      style={{ borderColor: style.stroke, background: style.bg }}
    >
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 p-2.5 text-caption1 font-semibold [&::-webkit-details-marker]:hidden"
        style={{ color: style.fg }}
      >
        {anyLost ? (
          <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
        ) : (
          <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
        )}
        {headline}
        <ChevronDown
          aria-hidden="true"
          className="ml-auto size-3.5 shrink-0 transition-transform duration-150 ease-[var(--ease-easy)] group-open:rotate-180"
        />
      </summary>

      <ul className="space-y-2.5 px-2.5 pb-2.5">
        {groups.map((group) => {
          const tone = IMPACT_STYLE[group.impact];
          return (
            <li
              key={group.code}
              className="rounded-sm border p-2.5"
              style={{ borderColor: "var(--fl-stroke-2)", background: "var(--fl-bg-1)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-caption1 font-semibold" style={{ color: tone.fg }}>
                  {group.label}
                </p>
                <span
                  className="shrink-0 rounded-sm border px-1.5 text-caption2 font-semibold tabular-nums"
                  style={{ borderColor: tone.stroke, color: tone.fg }}
                >
                  {group.count}
                </span>
              </div>

              <p className="mt-1 text-caption1 leading-relaxed text-[var(--fl-fg-2)]">
                {group.explanation}
              </p>

              {group.examples.length > 0 ? (
                <p className="mt-1.5 truncate text-caption2 text-[var(--fl-fg-3)]">
                  {group.examples.join(" · ")}
                  {group.count > group.examples.length
                    ? ` and ${group.count - group.examples.length} more`
                    : ""}
                </p>
              ) : null}

              {group.worthRetrying ? (
                <p className="mt-1.5 text-caption2" style={{ color: "var(--fl-fg-3)" }}>
                  Running research again may clear this.
                </p>
              ) : null}

              {/* The real text, one level deeper — needed only when the summary
                  is not enough, which is mostly the "unexpected" bucket. */}
              <details className="mt-1.5">
                <summary className="cursor-pointer text-caption2 text-[var(--fl-fg-3)] hover:underline">
                  Technical detail
                </summary>
                <p className="mt-1 break-words font-mono text-caption2 leading-relaxed text-[var(--fl-fg-3)]">
                  {group.sample}
                </p>
              </details>
            </li>
          );
        })}

        {notShown > 0 ? (
          <li className="text-caption2 text-[var(--fl-fg-3)]">
            Counts cover the {failures.length} most recent of {totalCount} logged entries.
          </li>
        ) : null}
      </ul>
    </details>
  );
}
