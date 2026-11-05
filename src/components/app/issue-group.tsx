"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CircleAlert,
  CircleCheckBig,
  ExternalLink,
  Info,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  excludeLeadAction,
  setLeadEmailAction,
  setLeadWebsiteAction,
} from "@/app/(dashboard)/campaigns/fix-actions";
import type { IssueGroup, LeadIssueRow } from "@/lib/campaigns/readiness";
import type { FormState } from "@/lib/actions/form";

/**
 * One group of pre-launch issues, with its repair built in.
 *
 * The rule this component exists to enforce: an issue is never reported without
 * the control that resolves it. Before this, "no email address" meant leaving
 * the campaign, finding that one lead among dozens, editing it, and coming back
 * to see whether the count moved.
 *
 * Rows disappear from the group as they are fixed — the row is marked done
 * locally and the router refreshes, so the issue count and the cost estimate
 * both settle without a full navigation.
 */

const SEVERITY_ICON = {
  blocking: TriangleAlert,
  attention: CircleAlert,
  info: Info,
} as const;

const SEVERITY_TONE = {
  blocking: "warning",
  attention: "warning",
  info: "neutral",
} as const;

const SEVERITY_COLOR = {
  blocking: "var(--fl-warning-fg)",
  attention: "var(--fl-warning-fg)",
  info: "var(--fl-fg-3)",
} as const;

export function IssueGroupCard({
  group,
  canEdit,
  onRunResearch,
  researchDisabledReason,
}: {
  group: IssueGroup;
  canEdit: boolean;
  /** Rendered for the `run-research` fix, which is a campaign-level action. */
  onRunResearch?: React.ReactNode;
  researchDisabledReason?: string;
}) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const Icon = SEVERITY_ICON[group.severity];

  const remaining = group.count - resolved.size;
  const visible = group.leads.filter((l) => !resolved.has(l.clinicId));
  const hidden = Math.max(0, remaining - visible.length);

  return (
    <Card elevation="flat" className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--fl-stroke-2)] px-4 py-3">
        <div className="flex min-w-0 gap-2.5">
          <Icon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
            style={{ color: SEVERITY_COLOR[group.severity] }}
          />
          <div className="min-w-0">
            <h3 className="text-body1 font-semibold">
              {remaining === 0 ? "All resolved" : group.title}
            </h3>
            <p className="mt-0.5 text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
              {group.consequence}
            </p>
          </div>
        </div>
        {remaining === 0 ? (
          <Badge tone="success">
            <CircleCheckBig aria-hidden="true" className="size-3" />
            Fixed
          </Badge>
        ) : (
          <Badge tone={SEVERITY_TONE[group.severity]}>{remaining}</Badge>
        )}
      </div>

      {remaining === 0 ? null : (
        <>
          {group.fix === "run-research" ? (
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              {onRunResearch}
              {researchDisabledReason ? (
                <p className="text-caption1 text-[var(--fl-fg-3)]">{researchDisabledReason}</p>
              ) : null}
            </div>
          ) : null}

          <ul className="divide-y divide-[var(--fl-stroke-2)]">
            {visible.map((lead) => (
              <li key={lead.clinicId} className="px-4 py-2.5">
                <FixRow
                  lead={lead}
                  fix={group.fix}
                  canEdit={canEdit}
                  onResolved={() => setResolved((prev) => new Set(prev).add(lead.clinicId))}
                />
              </li>
            ))}
          </ul>

          {hidden > 0 ? (
            <p className="border-t border-[var(--fl-stroke-2)] px-4 py-2.5 text-caption1 text-[var(--fl-fg-3)]">
              and {hidden} more with the same issue.
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}

function FixRow({
  lead,
  fix,
  canEdit,
  onResolved,
}: {
  lead: LeadIssueRow;
  fix: IssueGroup["fix"];
  canEdit: boolean;
  onResolved: () => void;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (action: () => Promise<FormState>) =>
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        toast.success(res.message ?? "Saved.");
        onResolved();
        // Refresh so the summary counts and the cost estimate reflect the fix.
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not save that.");
      }
    });

  const inline = fix === "website" || fix === "email";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="min-w-0 flex-1 basis-48">
        <Link
          href={`/leads/${lead.clinicId}`}
          className="truncate text-body1 font-medium text-[var(--fl-brand-text)] hover:underline"
        >
          {lead.name}
        </Link>
        <p className="truncate text-caption2 text-[var(--fl-fg-3)]">
          {lead.category ?? "Uncategorized"}
          {fix === "email" && lead.websiteUrl ? ` · ${hostOf(lead.websiteUrl)}` : ""}
        </p>
      </div>

      {inline && canEdit ? (
        <form
          className="flex flex-1 basis-64 items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!value.trim() || pending) return;
            submit(() =>
              fix === "website"
                ? setLeadWebsiteAction(lead.clinicId, value)
                : setLeadEmailAction(lead.clinicId, value),
            );
          }}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
            inputMode={fix === "email" ? "email" : "url"}
            // Not type="url"/"email": the browser's own validation bubble fires
            // before the action can give a useful message, and the action
            // already normalizes a bare domain to https://.
            placeholder={fix === "website" ? "clinic.com" : "name@clinic.com"}
            aria-label={
              fix === "website" ? `Website for ${lead.name}` : `Email address for ${lead.name}`
            }
            className="h-8"
          />
          <Button type="submit" size="sm" disabled={pending || !value.trim()}>
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Save
          </Button>
        </form>
      ) : null}

      {fix === "none" ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={`/leads/${lead.clinicId}`}>
            Open lead
            <ExternalLink aria-hidden="true" />
          </Link>
        </Button>
      ) : null}

      {inline && canEdit ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => submit(() => excludeLeadAction(lead.clinicId))}
          title="Exclude this lead from the campaign"
        >
          Skip
        </Button>
      ) : null}

      {!canEdit ? (
        <span className="text-caption1 text-[var(--fl-fg-3)]">Member access required</span>
      ) : null}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
