import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, GraduationCap, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { HelpSearch } from "@/components/app/help-search";
import { ARTICLES } from "@/lib/help/content";

export const metadata: Metadata = {
  title: "Help Centre",
  description:
    "How research, scoring, drafting and Gmail approval work in this app, written for clinic operations teams.",
};

/**
 * The Help Centre landing page.
 *
 * Static by design: nothing here is org-specific, so the page renders the same
 * content for everyone and search runs entirely in the browser. That keeps help
 * available and fast even when a query on another page is struggling.
 */
export default function HelpPage() {
  return (
    <div className="space-y-8 pb-16">
      <header className="space-y-2">
        <h1 className="text-title2 font-semibold tracking-tight text-foreground">Help Centre</h1>
        <p className="max-w-2xl text-body2 leading-7 text-[var(--fl-fg-2)]">
          {ARTICLES.length} articles covering how clinics get researched and scored, how an email
          draft is written and checked, and what happens when you approve one. Written for the
          person doing the work, not for a developer.
        </p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <Card elevation="interactive">
          <Link
            href="/tutorial"
            className="flex h-full items-start gap-3 rounded-md p-4 transition-colors duration-100 ease-[var(--ease-easy)]"
          >
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--fl-brand-tint)] text-[var(--fl-brand-text)]"
            >
              <GraduationCap className="size-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-body2 font-semibold text-foreground">
                Take the guided tutorial
                <ArrowRight aria-hidden="true" className="size-4 text-[var(--fl-brand-text)]" />
              </span>
              <span className="mt-0.5 block text-body1 leading-6 text-[var(--fl-fg-2)]">
                A walkthrough of every feature in order, against your own data, with your setup
                progress tracked as you go.
              </span>
            </span>
          </Link>
        </Card>

        <Card elevation="flat" className="bg-[var(--fl-bg-2)]">
          <div className="flex h-full items-start gap-3 p-4">
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--fl-bg-4)] text-[var(--fl-fg-2)]"
            >
              <ShieldCheck className="size-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body2 font-semibold text-foreground">
                This app never sends an email
              </p>
              <p className="mt-0.5 text-body1 leading-6 text-[var(--fl-fg-2)]">
                Approving a draft creates a draft in your Gmail account. You open Gmail, read it,
                and press Send yourself. Nothing leaves your mailbox without you.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <HelpSearch />
    </div>
  );
}
