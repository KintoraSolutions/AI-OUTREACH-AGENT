"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Ban, Check, MailX, X } from "lucide-react";
import { DraftStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { QueueItem } from "@/lib/drafts/queue";

/**
 * The review queue list.
 *
 * Keyboard-first on purpose: the whole point of this screen is working through
 * many drafts in a row, and reaching for the mouse between every one is the
 * difference between reviewing twenty and reviewing three.
 *   j / ArrowDown  next draft
 *   k / ArrowUp    previous draft
 * Suppressed while typing, so editing a draft body never navigates away.
 */

const STATUS_META: Record<
  DraftStatus,
  { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger"; Icon: typeof Check }
> = {
  [DraftStatus.GENERATED]: { label: "In review", tone: "info", Icon: Check },
  [DraftStatus.EDITED]: { label: "Edited", tone: "info", Icon: Check },
  [DraftStatus.BLOCKED]: { label: "Blocked", tone: "danger", Icon: Ban },
  [DraftStatus.APPROVED]: { label: "Approved", tone: "success", Icon: Check },
  [DraftStatus.REJECTED]: { label: "Rejected", tone: "neutral", Icon: X },
  [DraftStatus.SENT_EXTERNAL]: { label: "Sent externally", tone: "neutral", Icon: Check },
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return (
    el.isContentEditable ||
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT"
  );
}

export function ReviewQueue({
  items,
  activeClinicId,
  bucket,
}: {
  items: QueueItem[];
  activeClinicId: string | null;
  bucket: string;
}) {
  const router = useRouter();
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  const index = items.findIndex((i) => i.clinicId === activeClinicId);

  // Keep the selected row in view when arriving by keyboard or deep link.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeClinicId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const forward = e.key === "j" || e.key === "ArrowDown";
      const back = e.key === "k" || e.key === "ArrowUp";
      if (!forward && !back) return;

      const next = forward ? index + 1 : index - 1;
      const target = items[next];
      if (!target) return;

      e.preventDefault();
      router.push(`/review?bucket=${bucket}&id=${target.clinicId}`, { scroll: false });
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items, bucket, router]);

  if (items.length === 0) return null;

  return (
    <ul className="divide-y divide-[var(--fl-stroke-2)]">
      {items.map((item, i) => {
        const active = item.clinicId === activeClinicId;
        const meta = STATUS_META[item.status];

        return (
          <li key={item.clinicId}>
            <Link
              ref={active ? activeRef : undefined}
              href={`/review?bucket=${bucket}&id=${item.clinicId}`}
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={cn(
                "relative flex flex-col gap-1.5 px-3 py-2.5 transition-colors",
                active
                  ? "fl-selected-indicator bg-[var(--fl-brand-tint)]"
                  : "hover:bg-[var(--fl-subtle-hover)]",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span
                  className={cn(
                    "line-clamp-2 text-body1 font-semibold",
                    active ? "text-[var(--fl-brand-text)]" : "text-foreground",
                  )}
                >
                  {item.clinicName}
                </span>
                <span className="stat shrink-0 text-body1 font-semibold tabular-nums text-[var(--fl-fg-2)]">
                  {item.overallScore ?? "—"}
                  <span className="sr-only"> out of 100</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={meta.tone}>{meta.label}</Badge>
                {item.version > 1 ? (
                  <span className="text-caption2 text-[var(--fl-fg-3)]">v{item.version}</span>
                ) : null}

                {/* Both of these change whether an email can actually go out,
                    so they belong in the queue rather than only on the draft. */}
                {item.warningCount > 0 ? (
                  <span className="inline-flex items-center gap-1 text-caption2 text-[var(--fl-warning-fg)]">
                    <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                    {item.warningCount}
                    <span className="sr-only">
                      {item.warningCount === 1 ? " review warning" : " review warnings"}
                    </span>
                  </span>
                ) : null}
                {!item.hasRecipient ? (
                  <span className="inline-flex items-center gap-1 text-caption2 text-[var(--fl-fg-3)]">
                    <MailX className="size-3 shrink-0" aria-hidden="true" />
                    <span className="sr-only">No recipient email</span>
                    No email
                  </span>
                ) : null}
              </div>

              <span className="sr-only">{`Item ${i + 1} of ${items.length}`}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
