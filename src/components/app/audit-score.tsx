import { Confidence, FindingCategory, type AuditLogAction } from "@prisma/client";
import { ExternalLink } from "lucide-react";
import {
  AUDIT_LOG_ACTION_LABELS,
  CONFIDENCE_LABELS,
  FINDING_CATEGORY_LABELS,
  SCORE_CONFIDENCE_LABELS,
  SCORE_CONFIDENCE_TONES,
  SERVICE_LABELS,
  SERVICE_TONES,
  type BadgeTone,
} from "@/lib/leads/constants";
import { formatDateTime } from "@/lib/format";
import {
  categorySubtotal,
  effectiveOverall,
  effectiveService,
  SCORE_CATEGORY_ORDER,
  type ScoreView,
} from "@/lib/scoring/view";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecalcButton, ClearOverrideButton, ScoreOverrideForm } from "@/components/app/score-actions";
import { AddFindingForm, FindingDismissButton } from "@/components/app/finding-controls";

const CONFIDENCE_TONES: Record<Confidence, BadgeTone> = {
  VERIFIED: "success",
  STRONG_INFERENCE: "info",
  WEAK_INFERENCE: "warning",
  UNKNOWN: "neutral",
};

function SourceLink({ href }: { href: string }) {
  if (!href || href === "manual-entry" || !/^https?:\/\//.test(href)) {
    return <span className="text-xs text-muted-foreground">{href || "—"}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline break-all"
    >
      {href.replace(/^https?:\/\//, "").slice(0, 60)}
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}

export interface FindingRow {
  id: string;
  category: FindingCategory;
  code: string;
  finding: string;
  evidence: string;
  sourceUrl: string;
  confidence: Confidence;
  isFact: boolean;
  scoreContribution: number;
  manual: boolean;
  dismissed: boolean;
  subarea: string | null;
}

// ---------------------------------------------------------------------------
// Score summary
// ---------------------------------------------------------------------------

export function ScoreCard({
  view,
  clinicId,
  canEdit,
  canManage,
}: {
  view: ScoreView;
  clinicId: string;
  canEdit: boolean;
  canManage: boolean;
}) {
  const overall = effectiveOverall(view);
  const service = effectiveService(view);
  const rec = view.breakdown.recommendation;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle>Lead score</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? <RecalcButton clinicId={clinicId} /> : null}
          {canManage ? <ScoreOverrideForm clinicId={clinicId} /> : null}
          {canManage && view.manualOverride ? <ClearOverrideButton clinicId={clinicId} /> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="stat text-[44px] font-medium leading-none text-[var(--mint)] [text-shadow:0_0_20px_rgba(61,220,151,0.4)]">
                {overall}
              </span>
              <span className="stat text-sm text-muted-foreground">/ 100</span>
            </div>
            {view.manualOverride ? (
              <p className="text-xs text-[var(--amber)]">
                Overridden{view.overrideOverall !== null ? ` (computed ${view.overallScore})` : ""}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SERVICE_TONES[service]}>{SERVICE_LABELS[service]}</Badge>
            <Badge tone={SCORE_CONFIDENCE_TONES[view.confidence]}>
              {SCORE_CONFIDENCE_LABELS[view.confidence]}
            </Badge>
            {view.manualOverride ? <Badge tone="warning">Manual override</Badge> : null}
          </div>
        </div>

        <dl className="grid gap-2">
          {SCORE_CATEGORY_ORDER.map((cat) => {
            const cell = view.breakdown.categories[cat];
            const subtotal = categorySubtotal(view, cat);
            const cap = cell?.cap ?? 0;
            const pct = cap > 0 ? Math.round((subtotal / cap) * 100) : 0;
            return (
              <div key={cat} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3">
                <dt className="text-xs text-muted-foreground">{FINDING_CATEGORY_LABELS[cat]}</dt>
                <dd className="h-2 overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div
                    className="h-full rounded-full bg-[var(--mint)] shadow-[0_0_8px_rgba(61,220,151,0.4)]"
                    style={{ width: `${pct}%` }}
                  />
                </dd>
                <dd className="stat text-right text-xs text-foreground">
                  {subtotal}/{cap}
                </dd>
              </div>
            );
          })}
        </dl>

        <div className="space-y-1 rounded-md border p-3 text-sm">
          <p className="font-medium">Recommendation: {SERVICE_LABELS[service]}</p>
          <p className="text-muted-foreground">
            {view.manualOverride && view.overrideReason ? view.overrideReason : rec.reason}
          </p>
          {rec.alternatives.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Alternatives:{" "}
              {rec.alternatives.map((a) => `${SERVICE_LABELS[a.service]} (${a.subtotal})`).join(", ")}
            </p>
          ) : null}
          {rec.uncertainties.length > 0 ? (
            <p className="text-xs text-muted-foreground">Uncertainties: {rec.uncertainties.join(" ")}</p>
          ) : null}
          {rec.missingInfo.length > 0 ? (
            <p className="text-xs text-muted-foreground">Missing info: {rec.missingInfo.join(" ")}</p>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Ruleset {view.weightsVersion} · calculated {formatDateTime(view.computedAt)}
        </p>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Rule-by-rule breakdown
// ---------------------------------------------------------------------------

export function ScoreBreakdownList({ view }: { view: ScoreView }) {
  return (
    <div className="space-y-4">
      {SCORE_CATEGORY_ORDER.map((cat) => {
        const cell = view.breakdown.categories[cat];
        if (!cell || cell.contributions.length === 0) return null;
        return (
          <div key={cat} className="rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-medium">{FINDING_CATEGORY_LABELS[cat]}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {cell.subtotal}/{cell.cap}
              </span>
            </div>
            <ul className="divide-y">
              {cell.contributions.map((c, i) => (
                <li key={`${c.ruleId}-${i}`} className="space-y-1 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">{c.label}</span>
                    <span className="text-xs font-medium tabular-nums">+{c.points}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{c.evidence}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={c.isFact ? "success" : "neutral"}>{c.isFact ? "Fact" : "Inference"}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {c.basePoints} base × {c.confidenceMultiplier} ({CONFIDENCE_LABELS[c.confidence]})
                    </span>
                    <SourceLink href={c.sourceUrl} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {view.breakdown.rejected.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {view.breakdown.rejected.length} finding(s) contributed no points because their evidence was
          below the required confidence.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Findings (facts separated from inferences), with dismiss/add controls
// ---------------------------------------------------------------------------

export function AuditFindingsList({
  findings,
  clinicId,
  canEdit,
}: {
  findings: FindingRow[];
  clinicId: string;
  canEdit: boolean;
}) {
  const active = findings.filter((f) => !f.dismissed);
  const facts = active.filter((f) => f.isFact);
  const inferences = active.filter((f) => !f.isFact);
  const dismissed = findings.filter((f) => f.dismissed);

  return (
    <div className="space-y-4">
      {canEdit ? <AddFindingForm clinicId={clinicId} /> : null}

      <FindingGroup title="Facts" findings={facts} clinicId={clinicId} canEdit={canEdit} />
      <FindingGroup title="Inferences" findings={inferences} clinicId={clinicId} canEdit={canEdit} />
      {dismissed.length > 0 ? (
        <FindingGroup title="Dismissed" findings={dismissed} clinicId={clinicId} canEdit={canEdit} dimmed />
      ) : null}
    </div>
  );
}

function FindingGroup({
  title,
  findings,
  canEdit,
  dimmed,
}: {
  title: string;
  findings: FindingRow[];
  clinicId: string;
  canEdit: boolean;
  dimmed?: boolean;
}) {
  if (findings.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({findings.length})
      </p>
      <ul className="space-y-2">
        {findings.map((f) => (
          <li key={f.id} className={`rounded-md border p-3 ${dimmed ? "opacity-60" : ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{f.finding}</p>
                <p className="text-sm text-muted-foreground">{f.evidence}</p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge tone="neutral">{FINDING_CATEGORY_LABELS[f.category]}</Badge>
                  <Badge tone={CONFIDENCE_TONES[f.confidence]}>{CONFIDENCE_LABELS[f.confidence]}</Badge>
                  <Badge tone={f.isFact ? "success" : "neutral"}>{f.isFact ? "Fact" : "Inference"}</Badge>
                  {f.manual ? <Badge tone="info">Manual</Badge> : null}
                  <span className="text-xs text-muted-foreground">+{f.scoreContribution} pts</span>
                  <SourceLink href={f.sourceUrl} />
                </div>
              </div>
              {canEdit ? <FindingDismissButton findingId={f.id} dismissed={f.dismissed} /> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Audit history (immutable log)
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  id: string;
  action: AuditLogAction;
  entityType: string;
  reason: string;
  actorName: string | null;
  createdAt: string;
}

export function AuditHistoryList({ entries }: { entries: AuditLogRow[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No manual changes recorded yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {entries.map((e) => (
        <li key={e.id} className="rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">{AUDIT_LOG_ACTION_LABELS[e.action]}</span>
            <span className="text-xs text-muted-foreground">{formatDateTime(e.createdAt)}</span>
          </div>
          <p className="text-muted-foreground">{e.reason}</p>
          <p className="text-xs text-muted-foreground">{e.actorName ?? "System"}</p>
        </li>
      ))}
    </ul>
  );
}
