"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { PipelineStage, type LeadSource, type RecommendedService, type ScoreConfidence } from "@prisma/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { StageSelect } from "@/components/app/stage-select";
import { Radar } from "@/components/app/charts";
import {
  SCORE_CONFIDENCE_TONES,
  SERVICE_LABELS,
  SERVICE_TONES,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/lib/leads/constants";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bulkSetStage, bulkSetDoNotContact } from "@/app/(dashboard)/leads/actions";

const CONF_SHORT: Record<ScoreConfidence, string> = { HIGH: "High", MEDIUM: "Med", LOW: "Low" };

export interface LeadRow {
  id: string;
  name: string;
  category: string | null;
  location: string | null;
  overallScore: number | null;
  websiteScore: number | null;
  softwareScore: number | null;
  klearqScore: number | null;
  contactabilityScore: number | null;
  businessFitScore: number | null;
  recommendedService: RecommendedService | null;
  confidence: ScoreConfidence | null;
  manualOverride: boolean;
  findingCount: number;
  lastAuditedAt: string | null;
  stage: PipelineStage;
  contacted: boolean;
  leadSource: LeadSource;
  isTestData: boolean;
  duplicateCandidate: boolean;
}

/** Compact numeric fallback for the radar (small screens). */
function ProfileNumbers({ row }: { row: LeadRow }) {
  const dims: [string, number | null][] = [
    ["W", row.websiteScore],
    ["S", row.softwareScore],
    ["K", row.klearqScore],
    ["C", row.contactabilityScore],
    ["F", row.businessFitScore],
  ];
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
      {dims.map(([k, v]) => (
        <span key={k}>
          <span className="text-[var(--faint-foreground)]">{k}</span> {v ?? "—"}
        </span>
      ))}
    </div>
  );
}

export function LeadTable({ rows, canEdit }: { rows: LeadRow[]; canEdit: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState<PipelineStage>(PipelineStage.QUALIFIED);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyBulk() {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      const res = await bulkSetStage(selectedIds, bulkStage);
      if (res.ok) {
        toast.success(res.message ?? "Updated.");
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not update.");
      }
    });
  }

  function applyDoNotContact() {
    if (selectedIds.length === 0) return;
    startTransition(async () => {
      const res = await bulkSetDoNotContact(selectedIds, true);
      if (res.ok) {
        toast.success(res.message ?? "Updated.");
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not update.");
      }
    });
  }

  return (
    <div className="space-y-2.5">
      {canEdit && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[7px] border border-[var(--hairline)] bg-[var(--surface-2)] px-3 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <span className="text-muted-foreground">Set stage to</span>
          <Select
            className="h-8 w-44 text-xs"
            value={bulkStage}
            onChange={(e) => setBulkStage(e.target.value as PipelineStage)}
          >
            {STAGE_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={applyBulk} disabled={pending}>
            {pending ? "Applying..." : "Apply"}
          </Button>
          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
          <Button size="sm" variant="outline" onClick={applyDoNotContact} disabled={pending}>
            Mark do-not-contact
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-[8px] border border-[var(--hairline)] [&_td]:px-2.5 [&_td]:py-2 [&_th]:h-9 [&_th]:px-2.5">
        <Table className="text-[13px]">
          <TableHeader>
            <TableRow>
              {canEdit ? (
                <TableHead className="w-8">
                  <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </TableHead>
              ) : null}
              <TableHead>Clinic</TableHead>
              <TableHead className="text-center">Overall</TableHead>
              <TableHead className="text-center">Performance profile</TableHead>
              <TableHead>Service &amp; confidence</TableHead>
              <TableHead className="text-right">Findings</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Audited</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-state={selected.has(row.id) ? "selected" : undefined}>
                {canEdit ? (
                  <TableCell>
                    <Checkbox
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      aria-label={`Select ${row.name}`}
                    />
                  </TableCell>
                ) : null}

                {/* Clinic: name / category / address */}
                <TableCell className="max-w-[260px]">
                  <Link href={`/leads/${row.id}`} className="block truncate font-medium hover:underline">
                    {row.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate">{row.category ?? "Uncategorized"}</span>
                    {row.isTestData ? <Badge tone="neutral">Test</Badge> : null}
                    {row.duplicateCandidate ? (
                      <span
                        className="inline-flex shrink-0 items-center gap-0.5 text-[var(--amber)]"
                        title="Another lead shares a similar name"
                      >
                        <AlertTriangle className="size-3" />
                        Dup?
                      </span>
                    ) : null}
                  </div>
                  {row.location ? (
                    <div className="mt-0.5 truncate text-[11px] text-[var(--faint-foreground)]">
                      {row.location}
                    </div>
                  ) : null}
                </TableCell>

                {/* Overall score */}
                <TableCell className="text-center">
                  {row.overallScore === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="inline-flex items-baseline gap-0.5">
                      <span
                        className={cn(
                          "text-[18px] font-semibold tabular-nums",
                          row.overallScore >= 80
                            ? "text-[var(--mint)]"
                            : row.overallScore >= 60
                              ? "text-foreground"
                              : "text-muted-foreground",
                        )}
                      >
                        {row.overallScore}
                      </span>
                      {row.manualOverride ? (
                        <span title="Manual override" className="text-[var(--amber)]">
                          *
                        </span>
                      ) : null}
                    </span>
                  )}
                </TableCell>

                {/* Performance profile: radar (md+) / numbers (small) */}
                <TableCell>
                  <div className="hidden justify-center md:flex">
                    <Radar
                      size={62}
                      values={[
                        { label: "WEB", value: row.websiteScore },
                        { label: "SW", value: row.softwareScore },
                        { label: "KQ", value: row.klearqScore },
                        { label: "CON", value: row.contactabilityScore },
                        { label: "FIT", value: row.businessFitScore },
                      ]}
                    />
                  </div>
                  <div className="md:hidden">
                    <ProfileNumbers row={row} />
                  </div>
                </TableCell>

                {/* Service & confidence tags */}
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {row.recommendedService ? (
                      <Badge tone={SERVICE_TONES[row.recommendedService]}>
                        {SERVICE_LABELS[row.recommendedService]}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {row.confidence ? (
                      <Badge tone={SCORE_CONFIDENCE_TONES[row.confidence]}>
                        {CONF_SHORT[row.confidence]}
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>

                {/* Findings */}
                <TableCell className="text-right">
                  <Link
                    href={`/leads/${row.id}`}
                    className="text-[12px] tabular-nums text-muted-foreground hover:text-foreground hover:underline"
                  >
                    {row.findingCount} Findings
                  </Link>
                </TableCell>

                {/* Stage */}
                <TableCell>
                  {canEdit ? (
                    <StageSelect clinicId={row.id} stage={row.stage} className="w-full min-w-[132px]" />
                  ) : (
                    <span className="text-[13px]">{STAGE_LABELS[row.stage]}</span>
                  )}
                </TableCell>

                {/* Audited */}
                <TableCell className="whitespace-nowrap text-[12px] text-muted-foreground">
                  {formatDate(row.lastAuditedAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
