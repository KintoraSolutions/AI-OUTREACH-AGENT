import { Info } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatTokens,
  formatUsd,
  type CampaignCostEstimate,
  type ResearchCostEstimate,
} from "@/lib/campaigns/cost";

/**
 * What the run will cost, before it is started.
 *
 * Presented as an estimate with its workings shown rather than a bare number:
 * the token counts come from the prompts this campaign would actually send, but
 * output length varies per draft, so a single confident-looking figure would be
 * overstating what we know. The worst case is given alongside.
 *
 * When the configured model has no published price in `MODEL_PRICING` the token
 * counts are still shown and the money is not — guessing a rate for an
 * unrecognised model is worse than admitting we do not have one.
 */
export function CampaignCostCard({
  cost,
  research,
}: {
  cost: CampaignCostEstimate;
  /** What a fresh discovery run would cost. Billed by Google, not by us. */
  research: ResearchCostEstimate;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Estimated cost</CardTitle>
        <CardDescription>
          {cost.leadCount === 0
            ? "No leads are ready to draft, so this run would cost nothing."
            : `One ${cost.modelLabel} call per lead, billed on tokens in and out.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {cost.priced ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-title2 font-semibold tabular-nums text-[var(--fl-brand-text)]">
              {formatUsd(cost.totalUsd)}
            </span>
            {cost.leadCount > 0 ? (
              <span className="text-body1 text-[var(--fl-fg-3)]">
                for {cost.leadCount} draft{cost.leadCount === 1 ? "" : "s"} ·{" "}
                {formatUsd(cost.perLeadUsd)} each
              </span>
            ) : null}
          </div>
        ) : (
          <div className="rounded-md border border-[var(--fl-stroke-2)] p-3">
            <p className="text-body1">
              No published price for <code>{cost.model}</code>.
            </p>
            <p className="mt-1 text-caption1 text-[var(--fl-fg-3)]">
              The token estimate below still applies; check your provider&apos;s rates for the
              amount.
            </p>
          </div>
        )}

        {cost.leadCount > 0 ? (
          <>
            <dl className="divide-y divide-[var(--fl-stroke-2)] border-y border-[var(--fl-stroke-2)] text-body1">
              <Line
                label="Input"
                detail={`${formatTokens(cost.inputTokens)} tokens — the prompt, your company profile and each lead's findings`}
                value={cost.priced ? formatUsd(cost.inputUsd) : null}
              />
              <Line
                label="Output"
                detail={`${formatTokens(cost.outputTokens)} tokens — the drafted emails`}
                value={cost.priced ? formatUsd(cost.outputUsd) : null}
              />
            </dl>

            <p className="flex gap-2 text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
              <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>
                An estimate. Output length varies per draft; if every one ran to its ceiling this
                would be{" "}
                {cost.priced ? (
                  <strong className="font-semibold">{formatUsd(cost.maxTotalUsd)}</strong>
                ) : (
                  `${formatTokens(cost.maxOutputTokens)} output tokens`
                )}
                . Leads that are skipped or blocked never reach the model and cost nothing.
              </span>
            </p>
          </>
        ) : null}

        {/* Research is billed separately, by Google, against the operator's own
            account — so it is shown as its own line rather than folded into a
            single total that would imply one invoice. */}
        <div className="border-t border-[var(--fl-stroke-2)] pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="text-body1 font-semibold">Running research again</h3>
            <span className="font-mono text-subtitle2 font-semibold tabular-nums">
              {formatUsd(research.totalUsd)}
            </span>
          </div>
          <p className="mt-1 text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
            About {research.calls} Google Places lookups at {formatUsd(research.usdPerCall)} each,
            billed by Google against your own account — the first{" "}
            {research.freeCallsPerMonth.toLocaleString("en-US")} each month are free, so this is
            often $0 in practice. Reading each clinic&apos;s website and scoring its speed cost
            nothing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function Line({
  label,
  detail,
  value,
}: {
  label: string;
  detail: string;
  value: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <dt className="font-medium">{label}</dt>
        <dd className="text-caption1 text-[var(--fl-fg-3)]">{detail}</dd>
      </div>
      {value ? (
        <span className="shrink-0 font-mono tabular-nums text-[var(--fl-fg-2)]">{value}</span>
      ) : null}
    </div>
  );
}
