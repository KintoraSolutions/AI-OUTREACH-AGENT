import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Compass } from "lucide-react";
import { checklistProgress, type ChecklistState } from "@/lib/onboarding/checklist";
import { HelpTip } from "@/components/app/help-tip";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Getting-started checklist.
 *
 * The one-time onboarding wizard ends by dropping the user on an analytics
 * page, which answers "how is the pipeline doing?" for someone who has no
 * pipeline yet. This card answers the question they actually have — "what do I
 * do next?" — and it is driven by real org rows (see `loadChecklistState`), not
 * by a remembered "you've done this" flag that would survive the data being
 * deleted.
 *
 * State is passed in rather than loaded here so the dashboard can fetch it in
 * the same parallel batch as its own queries instead of adding a second
 * round-trip after them.
 *
 * Once every step is done the card collapses to a single congratulations line
 * inside a <details>: a permanently-ticked checklist is clutter, but throwing
 * the steps away makes them unfindable, so they stay one click behind a native
 * disclosure that needs no client JavaScript.
 */

interface Step {
  key: keyof ChecklistState;
  label: string;
  detail: string;
  href: string;
  cta: string;
  /** Slug of the help article that explains this step. */
  help: string;
}

const STEPS = [
  {
    key: "aiConfirmed",
    label: "Confirm your AI setup",
    detail: "Check the offerings and the voice the AI writes in before it drafts anything.",
    href: "/settings",
    cta: "Open settings",
    help: "your-ai",
  },
  {
    key: "hasLeads",
    label: "Add your first leads",
    detail: "Add a clinic by hand, or import a CSV of clinics you already have.",
    href: "/leads/new",
    cta: "Add a lead",
    help: "adding-leads",
  },
  {
    key: "hasCampaign",
    label: "Create a research campaign",
    detail: "A campaign is the only way to research a clinic. Leads added by hand or by CSV stay unresearched until a campaign covers them.",
    href: "/campaigns/new",
    cta: "New campaign",
    help: "campaigns-and-research",
  },
  {
    key: "hasScoredLead",
    label: "Get your first lead scored",
    detail: "Run the campaign. Findings and a score appear on each clinic it researches.",
    href: "/campaigns",
    cta: "View campaigns",
    help: "how-scoring-works",
  },
  {
    key: "hasDraft",
    label: "Generate an email draft",
    detail: "Open a scored lead and generate a draft grounded in its findings.",
    href: "/leads",
    cta: "Open leads",
    help: "generating-drafts",
  },
  {
    key: "googleConnected",
    label: "Connect Google for Gmail drafts",
    detail: "Approved emails are placed in your Gmail drafts folder. Nothing is ever sent for you.",
    href: "/settings",
    cta: "Connect Google",
    help: "approving-and-gmail",
  },
  {
    key: "hasApprovedDraft",
    label: "Approve a draft",
    detail: "Read the evidence behind the draft, edit it, then approve it yourself.",
    href: "/leads",
    cta: "Review drafts",
    help: "approving-and-gmail",
  },
] as const satisfies readonly Step[];

function TourLink({ className }: { className?: string }) {
  return (
    <Link
      href="/tutorial"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md text-body1 font-semibold text-[var(--fl-brand-text)] hover:underline",
        className,
      )}
    >
      <Compass aria-hidden="true" className="size-4" strokeWidth={1.75} />
      Take the guided tour
    </Link>
  );
}

function StepRow({ step, status }: { step: Step; status: "done" | "next" | "todo" }) {
  const done = status === "done";
  const next = status === "next";

  return (
    <li
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3",
        next && "bg-[var(--fl-brand-tint)]",
      )}
    >
      {done ? (
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 size-[18px] shrink-0 text-[var(--fl-success-fg)]"
          strokeWidth={2}
        />
      ) : (
        <Circle
          aria-hidden="true"
          className={cn(
            "mt-0.5 size-[18px] shrink-0",
            next ? "text-[var(--fl-brand-text)]" : "text-[var(--fl-fg-3)]",
          )}
          strokeWidth={2}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {done || next ? (
            <span
              className={cn(
                "text-body1 font-semibold",
                done ? "text-[var(--fl-fg-2)]" : "text-[var(--fl-fg-1)]",
              )}
            >
              {step.label}
            </span>
          ) : (
            <Link
              href={step.href}
              className="rounded-md text-body1 font-semibold text-[var(--fl-brand-text)] hover:underline"
            >
              {step.label}
            </Link>
          )}
          <HelpTip slug={step.help} label={`What is "${step.label}"?`} />
        </div>
        <p className="mt-0.5 text-caption1 text-[var(--fl-fg-3)]">{step.detail}</p>
      </div>

      {/* State is spelled out in text on every row, so the tick, the ring and
          the tint are reinforcement rather than the only signal. */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {done ? (
          <span className="text-caption1 font-semibold text-[var(--fl-success-fg)]">Done</span>
        ) : next ? (
          <>
            <Badge tone="brand" className="bg-[var(--fl-bg-1)]">
              Next step
            </Badge>
            <Button asChild size="sm">
              <Link href={step.href}>
                {step.cta}
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </>
        ) : (
          <span className="text-caption1 text-[var(--fl-fg-3)]">Not started</span>
        )}
      </div>
    </li>
  );
}

export function GettingStarted({ state }: { state: ChecklistState }) {
  const { done, total, complete } = checklistProgress(state);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  // Index of the first unfinished step: the one thing to do next.
  const nextIndex = STEPS.findIndex((s) => !state[s.key]);

  const rows = STEPS.map((step, i) => (
    <StepRow
      key={step.key}
      step={step}
      status={state[step.key] ? "done" : i === nextIndex ? "next" : "todo"}
    />
  ));

  if (complete) {
    return (
      <section aria-labelledby="setup-heading">
        <h2 id="setup-heading" className="sr-only">
          Setup
        </h2>
        <Card elevation="flat">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md p-4 hover:bg-[var(--fl-subtle-hover)] [&::-webkit-details-marker]:hidden">
              <CheckCircle2
                aria-hidden="true"
                className="size-[18px] shrink-0 text-[var(--fl-success-fg)]"
                strokeWidth={2}
              />
              <span className="text-body1 font-semibold text-[var(--fl-fg-1)]">
                Setup complete. All {total} steps are done.
              </span>
              <span className="ml-auto text-caption1 font-semibold text-[var(--fl-brand-text)]">
                <span className="group-open:hidden">Review steps</span>
                <span className="hidden group-open:inline">Hide steps</span>
              </span>
            </summary>
            <ol className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
              {rows}
            </ol>
            <div className="border-t border-[var(--hairline)] p-4">
              <TourLink />
            </div>
          </details>
        </Card>
      </section>
    );
  }

  return (
    <section aria-labelledby="setup-heading">
      <Card elevation="raised" className="overflow-hidden">
        <div className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="setup-heading" className="text-subtitle2 font-semibold text-[var(--fl-fg-1)]">
              Finish setting up
            </h2>
            <span className="stat shrink-0 text-caption1 font-semibold text-[var(--fl-fg-2)]">
              {done} of {total} done
            </span>
          </div>
          <p className="mt-0.5 text-body1 text-[var(--fl-fg-2)]">
            Seven steps take you from an empty workspace to an email draft you have reviewed.
          </p>
          {/* Full-bleed bar: the read-out above is the accessible truth, this is
              the glanceable one. */}
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuetext={`${done} of ${total} steps done`}
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--fl-bg-4)]"
          >
            <div
              className="h-full rounded-full bg-[var(--fl-brand)] transition-[width] duration-500 ease-[var(--ease-decelerate)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <ol className="divide-y divide-[var(--hairline)] border-t border-[var(--hairline)]">
          {rows}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline)] bg-[var(--fl-bg-2)] p-4">
          <TourLink />
          <p className="text-caption1 text-[var(--fl-fg-3)]">
            This card disappears once all {total} steps are done.
          </p>
        </div>
      </Card>
    </section>
  );
}
