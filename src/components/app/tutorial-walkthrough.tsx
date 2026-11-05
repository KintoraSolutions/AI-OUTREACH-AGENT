"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleCheck,
  Info,
  RotateCcw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TutorialFigure } from "@/components/app/tutorial-figure";
import { CHAPTERS, CLOSING, chapterById, type Block, type Chapter } from "@/lib/tutorial/chapters";
import type { ChecklistState } from "@/lib/onboarding/checklist";
import { cn } from "@/lib/utils";

/**
 * The tutorial wizard.
 *
 * Three things make this more than a long page of prose:
 *
 * 1. It reads the org's REAL setup state, so a chapter whose prerequisite is
 *    already satisfied says "you have already done this" instead of instructing
 *    you to do it again. That turns the tutorial into a setup tracker.
 * 2. It remembers where you stopped, in localStorage, read in an effect so the
 *    server and client render the same markup on the first pass.
 * 3. The stepper is a real navigation landmark with a real ordered list, and
 *    each step's completion state is carried in TEXT rather than only in the
 *    colour of a dot.
 */

const STORAGE_KEY = "oa-tutorial-progress";

interface StoredProgress {
  visited: string[];
  last: string;
}

type StepState = "done" | "visited" | "unseen";

const STEP_STATE_TEXT: Record<StepState, string> = {
  done: "Already set up",
  visited: "Viewed",
  unseen: "Not viewed yet",
};

export function TutorialWalkthrough({ checklist }: { checklist: ChecklistState }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [visited, setVisited] = React.useState<ReadonlySet<string>>(() => new Set<string>());
  // Until storage has been read, nothing is written back, so a first paint can
  // never clobber a saved position with the default one.
  const [restored, setRestored] = React.useState(false);

  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const moveFocus = React.useRef(false);

  const active: Chapter | undefined = CHAPTERS[activeIndex];

  // --- Restore ---------------------------------------------------------------
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          const stored = parsed as Partial<StoredProgress>;
          if (Array.isArray(stored.visited)) {
            const known = stored.visited.filter(
              (id): id is string => typeof id === "string" && chapterById(id) !== null,
            );
            if (known.length > 0) setVisited(new Set(known));
          }
          if (typeof stored.last === "string") {
            const i = CHAPTERS.findIndex((c) => c.id === stored.last);
            if (i >= 0) setActiveIndex(i);
          }
        }
      }
    } catch {
      // Private mode, disabled storage, or unparseable JSON. Start from the top.
    }
    setRestored(true);
  }, []);

  // --- Mark the current chapter visited --------------------------------------
  React.useEffect(() => {
    const current = CHAPTERS[activeIndex];
    if (!current) return;
    setVisited((prev) => {
      if (prev.has(current.id)) return prev;
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
  }, [activeIndex]);

  // --- Persist ---------------------------------------------------------------
  React.useEffect(() => {
    if (!restored) return;
    const current = CHAPTERS[activeIndex];
    if (!current) return;
    try {
      const payload: StoredProgress = { visited: [...visited], last: current.id };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage unavailable. Progress simply does not survive a reload.
    }
  }, [restored, activeIndex, visited]);

  // --- Focus the new chapter heading, but not on first paint -----------------
  React.useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    headingRef.current?.focus();
  }, [activeIndex]);

  function goTo(index: number) {
    if (index < 0 || index >= CHAPTERS.length) return;
    moveFocus.current = true;
    setActiveIndex(index);
  }

  function restart() {
    setVisited(new Set<string>());
    goTo(0);
  }

  function stateOf(chapter: Chapter, index: number): StepState {
    if (chapter.requires && checklist[chapter.requires]) return "done";
    // The chapter you are on counts as viewed even before the effect lands.
    if (visited.has(chapter.id) || index === activeIndex) return "visited";
    return "unseen";
  }

  const viewedCount = CHAPTERS.filter((c, i) => visited.has(c.id) || i === activeIndex).length;
  const pct = Math.round((viewedCount / CHAPTERS.length) * 100);
  const isLast = activeIndex === CHAPTERS.length - 1;

  if (!active) return null;

  return (
    // Both tracks are minmax(0,...): a default `auto` track sizes to max-content,
    // which lets the horizontally scrolling stepper push the whole page wider
    // than the viewport instead of scrolling inside its own box.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[264px_minmax(0,1fr)] lg:items-start">
      {/* ---------------------------------------------------------------- */}
      {/* Stepper                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="min-w-0 lg:sticky lg:top-20">
        <Card elevation="flat" className="overflow-hidden">
          <div className="border-b border-[var(--fl-stroke-2)] p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-caption1 font-semibold text-[var(--fl-fg-3)]">Your progress</h2>
              <span className="stat text-caption1 font-semibold text-[var(--fl-fg-2)]">
                {viewedCount} of {CHAPTERS.length}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${viewedCount} of ${CHAPTERS.length} chapters viewed`}
              className="mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-[var(--fl-bg-4)]"
            >
              <div
                className="h-full rounded-sm bg-[var(--fl-brand)] transition-[width] duration-300 ease-[var(--ease-decelerate)]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          <nav aria-label="Tutorial chapters">
            {/* Horizontal, scrollable strip on small screens; a rail on large. */}
            <ol className="flex gap-2 overflow-x-auto p-3 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:p-2">
              {CHAPTERS.map((chapter, i) => {
                const state = stateOf(chapter, i);
                const isActive = i === activeIndex;
                return (
                  <li key={chapter.id} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      aria-current={isActive ? "step" : undefined}
                      className={cn(
                        "relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors duration-100 ease-[var(--ease-easy)]",
                        isActive
                          ? "fl-selected-indicator bg-[var(--fl-brand-tint)]"
                          : "hover:bg-[var(--fl-subtle-hover)]",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded-sm border text-caption2 font-semibold",
                          state === "done"
                            ? "border-[var(--fl-success-stroke)] bg-[var(--fl-success-bg)] text-[var(--fl-success-fg)]"
                            : isActive
                              ? "border-[var(--fl-brand)] bg-[var(--fl-brand)] text-[var(--fl-on-brand)]"
                              : "border-[var(--fl-stroke-1)] text-[var(--fl-fg-3)]",
                        )}
                      >
                        {state === "done" ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block truncate text-body1 lg:whitespace-normal",
                            isActive
                              ? "font-semibold text-[var(--fl-brand-text)]"
                              : "text-[var(--fl-fg-1)]",
                          )}
                        >
                          {chapter.title}
                        </span>
                        {/* Completion state as words, never colour alone. */}
                        <span
                          className={cn(
                            "hidden text-caption2 lg:block",
                            state === "done"
                              ? "font-semibold text-[var(--fl-success-fg)]"
                              : "text-[var(--fl-fg-3)]",
                          )}
                        >
                          {STEP_STATE_TEXT[state]}
                        </span>
                        <span className="sr-only lg:hidden">{STEP_STATE_TEXT[state]}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="border-t border-[var(--fl-stroke-2)] p-2">
            <Button variant="ghost" size="sm" onClick={restart} className="w-full justify-start">
              <RotateCcw aria-hidden="true" />
              Start over
            </Button>
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Chapter                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="min-w-0">
        <Card elevation="rest">
          <CardContent
            aria-live="polite"
            aria-atomic="false"
            className="p-5 pt-5 md:p-7"
          >
            <div key={active.id} className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-[var(--ease-decelerate)]">
              <p className="text-caption1 font-semibold text-[var(--fl-fg-3)]">
                Chapter {activeIndex + 1} of {CHAPTERS.length}
              </p>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="mt-1 text-title3 font-semibold tracking-[-0.01em] text-[var(--fl-fg-1)]"
              >
                {active.title}
              </h2>
              <p className="mt-1.5 text-body2 text-[var(--fl-fg-2)]">{active.goal}</p>

              {active.requires && checklist[active.requires] ? (
                <Alert variant="success" className="mt-4">
                  <CircleCheck aria-hidden="true" />
                  <AlertTitle>You have already done this</AlertTitle>
                  <AlertDescription>
                    Your organization already has this set up, so you can read this chapter as a
                    refresher or move straight on.
                  </AlertDescription>
                </Alert>
              ) : null}

              {active.figure ? (
                <figure className="mt-5 rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-2)] p-4">
                  <TutorialFigure figure={active.figure} />
                </figure>
              ) : null}

              <div className="mt-5 space-y-4">
                {active.body.map((block, i) => (
                  <BlockView key={i} block={block} />
                ))}
              </div>

              {active.lookFor && active.lookFor.length > 0 ? (
                <section
                  aria-labelledby={`lookfor-${active.id}`}
                  className="mt-6 rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-2)] p-4"
                >
                  <h3
                    id={`lookfor-${active.id}`}
                    className="flex items-center gap-2 text-body1 font-semibold text-[var(--fl-fg-1)]"
                  >
                    <Search aria-hidden="true" className="size-4 text-[var(--fl-fg-3)]" />
                    Look for these on screen
                  </h3>
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {active.lookFor.map((label) => (
                      <li
                        key={label}
                        className="rounded-md border border-[var(--fl-stroke-1)] bg-[var(--fl-bg-1)] px-2 py-0.5 text-caption1 text-[var(--fl-fg-2)]"
                      >
                        {label}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {active.cta || active.helpSlug ? (
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  {active.cta ? (
                    <Button asChild variant="outline">
                      <Link href={active.cta.href}>
                        {active.cta.label}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  ) : null}
                  {active.helpSlug ? (
                    <Button asChild variant="ghost">
                      <Link href={`/help/${active.helpSlug}`}>
                        <BookOpen aria-hidden="true" />
                        Read the full article
                      </Link>
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {isLast ? (
                <section
                  aria-labelledby="tutorial-closing"
                  className="mt-7 rounded-md border border-[var(--fl-brand-tint-stroke)] bg-[var(--fl-brand-tint)] p-5"
                >
                  <h3
                    id="tutorial-closing"
                    className="text-subtitle2 font-semibold text-[var(--fl-brand-text)]"
                  >
                    {CLOSING.title}
                  </h3>
                  <p className="mt-1.5 text-body1 text-[var(--fl-fg-2)]">{CLOSING.text}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {CLOSING.links.map((link, i) => (
                      <Button key={link.href} asChild variant={i === 0 ? "default" : "outline"}>
                        <Link href={link.href}>{link.label}</Link>
                      </Button>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Back / Next -------------------------------------------------- */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => goTo(activeIndex - 1)}
            disabled={activeIndex === 0}
          >
            <ArrowLeft aria-hidden="true" />
            Back
          </Button>

          <p className="hidden text-caption1 text-[var(--fl-fg-3)] sm:block">
            {isLast ? "Last chapter" : `Next: ${CHAPTERS[activeIndex + 1]?.title ?? ""}`}
          </p>

          <Button type="button" onClick={() => goTo(activeIndex + 1)} disabled={isLast}>
            Next
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

const NOTE_ICON = {
  info: Info,
  warning: TriangleAlert,
  success: CircleCheck,
} as const;

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "p":
      return <p className="text-body1 leading-relaxed text-[var(--fl-fg-2)]">{block.text}</p>;

    case "steps":
      return (
        <ol className="space-y-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-body1 leading-relaxed text-[var(--fl-fg-2)]">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm bg-[var(--fl-bg-4)] text-caption2 font-semibold text-[var(--fl-fg-2)]"
              >
                {i + 1}
              </span>
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ol>
      );

    case "list":
      return (
        <ul className="space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-body1 leading-relaxed text-[var(--fl-fg-2)]">
              <span
                aria-hidden="true"
                className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--fl-fg-4)]"
              />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      );

    case "definitions":
      return (
        <dl className="divide-y divide-[var(--fl-stroke-2)] overflow-hidden rounded-md border border-[var(--fl-stroke-2)]">
          {block.items.map((item, i) => (
            <div key={i} className="p-3.5 sm:flex sm:gap-4">
              <dt className="text-body1 font-semibold text-[var(--fl-fg-1)] sm:w-44 sm:shrink-0">
                {item.term}
              </dt>
              <dd className="mt-1 min-w-0 text-body1 leading-relaxed text-[var(--fl-fg-2)] sm:mt-0">
                {item.text}
              </dd>
            </div>
          ))}
        </dl>
      );

    case "note": {
      const Icon = NOTE_ICON[block.tone];
      return (
        <Alert variant={block.tone}>
          <Icon aria-hidden="true" />
          <AlertTitle>{block.title}</AlertTitle>
          <AlertDescription>{block.text}</AlertDescription>
        </Alert>
      );
    }

    case "table":
      return (
        <div className="overflow-hidden rounded-md border border-[var(--fl-stroke-2)]">
          <Table>
            <TableCaption className="mb-3 px-3">{block.caption}</TableCaption>
            <TableHeader>
              <TableRow>
                {block.head.map((h, i) => (
                  <TableHead key={i} scope="col">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((row, r) => (
                <TableRow key={r}>
                  {row.map((cell, c) =>
                    c === 0 ? (
                      <TableCell key={c} className="font-semibold text-[var(--fl-fg-1)]">
                        {cell}
                      </TableCell>
                    ) : (
                      <TableCell key={c} className="text-[var(--fl-fg-2)]">
                        {cell}
                      </TableCell>
                    ),
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
  }
}
