import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, CircleCheck, GraduationCap } from "lucide-react";
import { requireOrgContext } from "@/lib/auth/rbac";
import { checklistProgress, loadChecklistState } from "@/lib/onboarding/checklist";
import { Button } from "@/components/ui/button";
import { TutorialWalkthrough } from "@/components/app/tutorial-walkthrough";

export const metadata: Metadata = {
  title: "Tutorial",
  description: "A guided walkthrough of every feature, from your AI profile to sending in Gmail.",
};

/**
 * The tutorial page.
 *
 * A server component on purpose: it reads the organization's genuine setup
 * state once, on the server, and hands it to the client walkthrough. That is
 * what lets a chapter say "you have already done this" from live data rather
 * than from a tick the browser remembered, which would keep claiming success
 * after the underlying rows were deleted.
 */
export default async function TutorialPage() {
  const ctx = await requireOrgContext();
  const checklist = await loadChecklistState(ctx.orgId);
  const progress = checklistProgress(checklist);

  return (
    // The dashboard shell renders the breadcrumb trail itself (BreadcrumbBar in
    // the layout), so this page must not draw a second one.
    <div className="space-y-5 pb-4">
      <header className="rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] p-5 shadow-2 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 gap-4">
            <span
              aria-hidden="true"
              className="hidden size-11 shrink-0 items-center justify-center rounded-md bg-[var(--fl-brand-tint)] text-[var(--fl-brand-text)] sm:flex"
            >
              <GraduationCap className="size-6" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <h1 className="text-title2 font-semibold tracking-[-0.015em] text-[var(--fl-fg-1)]">
                Tutorial
              </h1>
              <p className="mt-1 max-w-2xl text-body2 text-[var(--fl-fg-2)]">
                A guided walkthrough of every feature, in the order you will actually use them. It
                checks your organization as you go, so chapters you have already completed are
                marked instead of repeated.
              </p>
            </div>
          </div>

          <Button asChild variant="outline" className="shrink-0">
            <Link href="/help">
              <BookOpen aria-hidden="true" />
              Help centre
            </Link>
          </Button>
        </div>

        {/* Live setup summary. Never colour alone: the count and the words carry
            the meaning, the tint only reinforces it. */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--fl-stroke-2)] pt-4">
          <span
            className={
              progress.complete
                ? "inline-flex items-center gap-1.5 rounded-md border border-[var(--fl-success-stroke)] bg-[var(--fl-success-bg)] px-2.5 py-1 text-caption1 font-semibold text-[var(--fl-success-fg)]"
                : "inline-flex items-center gap-1.5 rounded-md border border-[var(--fl-stroke-1)] bg-[var(--fl-bg-4)] px-2.5 py-1 text-caption1 font-semibold text-[var(--fl-fg-2)]"
            }
          >
            {progress.complete ? <CircleCheck aria-hidden="true" className="size-3.5" /> : null}
            Setup: {progress.done} of {progress.total} complete
          </span>
          <span className="text-caption1 text-[var(--fl-fg-3)]">
            {progress.complete
              ? "Everything is configured. Use this as a reference."
              : "Chapters covering what is still outstanding are marked as you reach them."}
          </span>
        </div>
      </header>

      <TutorialWalkthrough checklist={checklist} />
    </div>
  );
}
