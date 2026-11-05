"use client";

import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getArticle } from "@/lib/help/content";

/**
 * A small question-mark affordance that sits beside a label anywhere in the
 * app. Hovering or focusing it shows the linked help article's summary;
 * activating it opens the article.
 *
 * It is a link, not a button, because it navigates — so it works with
 * middle-click and "open in new tab" the way a reader expects, and assistive
 * technology announces it as a link.
 *
 * An unknown slug renders nothing at all. A help affordance that leads to a
 * 404 is worse than no affordance, and this way a call site can reference a
 * slug that has not been written yet without breaking the page it is on.
 *
 * `TooltipProvider` is mounted once in the dashboard layout; this component
 * deliberately does not mount its own.
 */
export function HelpTip({
  slug,
  label,
  className,
}: {
  slug: string;
  label?: string;
  className?: string;
}) {
  const article = getArticle(slug);
  if (!article) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={`/help/${article.slug}`}
          aria-label={label ?? `Help: ${article.title}`}
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-md align-middle text-[var(--fl-fg-3)]",
            "transition-colors duration-100 ease-[var(--ease-easy)]",
            "hover:bg-[var(--fl-subtle-hover)] hover:text-[var(--fl-brand-text)]",
            className,
          )}
        >
          <CircleHelp aria-hidden="true" className="size-4" strokeWidth={2} />
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-semibold">{article.title}</p>
        <p className="mt-0.5 text-[var(--fl-fg-2)]">{article.summary}</p>
      </TooltipContent>
    </Tooltip>
  );
}
