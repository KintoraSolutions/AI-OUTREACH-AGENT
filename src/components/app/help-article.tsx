import * as React from "react";
import { Info, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { headingId, type Block } from "@/lib/help/content";

/**
 * Renders a help article's blocks as semantic HTML.
 *
 * Every block maps to the element a reader's assistive technology expects:
 * steps become a real <ol>, bullets an <ul>, definitions a <dl>, and tables a
 * <table> with a proper <thead>. Headings become <h2> with a stable slugified
 * id, which is what the on-page table of contents anchors to.
 *
 * Note and warning blocks use the Fluent MessageBar, but with `role="note"`
 * rather than the primitive's default `role="alert"`. An alert is an assertive
 * live region: appropriate for something that just happened, wrong for prose
 * that was on the page before the reader arrived. Each also carries an icon and
 * a visually-hidden label, so the severity survives without color.
 */

function Para({ text }: { text: string }) {
  return <p className="text-body2 leading-7 text-[var(--fl-fg-2)]">{text}</p>;
}

export function HelpBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-5">
      {blocks.map((block, i) => (
        <HelpBlock key={i} block={block} />
      ))}
    </div>
  );
}

function HelpBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case "heading":
      return (
        <h2
          id={headingId(block.text)}
          className="scroll-mt-24 pt-4 text-subtitle1 font-semibold text-foreground"
        >
          {block.text}
        </h2>
      );

    case "para":
      return <Para text={block.text} />;

    case "steps":
      return (
        <ol className="ml-1 space-y-2.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--fl-brand-tint)] text-caption1 font-semibold tabular-nums text-[var(--fl-brand-text)]"
              >
                {i + 1}
              </span>
              <span className="text-body2 leading-7 text-[var(--fl-fg-2)]">{item}</span>
            </li>
          ))}
        </ol>
      );

    case "bullets":
      return (
        <ul className="ml-1 space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-[0.7rem] size-1.5 shrink-0 rounded-full bg-[var(--fl-fg-4)]"
              />
              <span className="text-body2 leading-7 text-[var(--fl-fg-2)]">{item}</span>
            </li>
          ))}
        </ul>
      );

    case "note":
      return (
        <Alert role="note" variant="info">
          <Info aria-hidden="true" />
          <AlertDescription className="text-body1 leading-6">
            <span className="sr-only">Note: </span>
            {block.text}
          </AlertDescription>
        </Alert>
      );

    case "warning":
      return (
        <Alert role="note" variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription className="text-body1 leading-6">
            <span className="sr-only">Important: </span>
            {block.text}
          </AlertDescription>
        </Alert>
      );

    case "table":
      return (
        <div className="overflow-hidden rounded-md border border-[var(--fl-stroke-2)]">
          <Table>
            <TableHeader>
              <TableRow>
                {block.head.map((h, i) => (
                  <TableHead key={i} scope="col" className="whitespace-normal">
                    {/* An empty corner cell still needs a name for screen readers. */}
                    {h || <span className="sr-only">Row label</span>}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {block.rows.map((row, r) => (
                <TableRow key={r}>
                  {row.map((cell, c) => (
                    <TableCell
                      key={c}
                      className={
                        c === 0
                          ? "align-top font-semibold text-foreground"
                          : "align-top text-[var(--fl-fg-2)]"
                      }
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );

    case "terms":
      return (
        <dl className="divide-y divide-[var(--fl-stroke-2)] overflow-hidden rounded-md border border-[var(--fl-stroke-2)]">
          {block.items.map((item, i) => (
            <div key={i} className="grid gap-1 p-4 sm:grid-cols-[11rem_1fr] sm:gap-4">
              <dt className="text-body1 font-semibold text-foreground">{item.term}</dt>
              <dd className="text-body1 leading-6 text-[var(--fl-fg-2)]">{item.definition}</dd>
            </div>
          ))}
        </dl>
      );
  }
}
