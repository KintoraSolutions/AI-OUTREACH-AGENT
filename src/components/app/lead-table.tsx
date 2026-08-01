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
import {
  SCORE_CONFIDENCE_TONES,
  SERVICE_LABELS,
  SERVICE_TONES,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/lib/leads/constants";
import { formatDate } from "@/lib/format";
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

function Num({ value }: { value: number | null }) {
  return value === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span className="tabular-nums">{value}</span>
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
    <div className="space-y-3">
      {canEdit && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
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

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {canEdit ? (
                <TableHead className="w-8">
                  <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                </TableHead>
              ) : null}
              <TableHead>Clinic</TableHead>
              <TableHead className="text-right">Overall</TableHead>
              <TableHead className="text-right" title="Website">Web</TableHead>
              <TableHead className="text-right" title="Custom software">SW</TableHead>
              <TableHead className="text-right" title="KlearQ">KQ</TableHead>
              <TableHead className="text-right" title="Contactability">Con</TableHead>
              <TableHead className="text-right" title="Business fit">Fit</TableHead>
              <TableHead>Service</TableHead>
              <TableHead>Confidence</TableHead>
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
                <TableCell>
                  <div className="flex flex-col">
                    <Link href={`/leads/${row.id}`} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {row.category ?? "Uncategorized"}
                      {row.isTestData ? <Badge tone="neutral">Test</Badge> : null}
                      {row.duplicateCandidate ? (
                        <span className="inline-flex items-center gap-0.5 text-amber-600" title="Another lead shares a similar name">
                          <AlertTriangle className="size-3" />
                          Possible duplicate
                        </span>
                      ) : null}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {row.overallScore === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <span className="tabular-nums">{row.overallScore}</span>
                      {row.manualOverride ? <span title="Manual override" className="text-amber-600">*</span> : null}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm"><Num value={row.websiteScore} /></TableCell>
                <TableCell className="text-right text-sm"><Num value={row.softwareScore} /></TableCell>
                <TableCell className="text-right text-sm"><Num value={row.klearqScore} /></TableCell>
                <TableCell className="text-right text-sm"><Num value={row.contactabilityScore} /></TableCell>
                <TableCell className="text-right text-sm"><Num value={row.businessFitScore} /></TableCell>
                <TableCell className="text-sm">
                  {row.recommendedService ? (
                    <Badge tone={SERVICE_TONES[row.recommendedService]}>{SERVICE_LABELS[row.recommendedService]}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {row.confidence ? (
                    <Badge tone={SCORE_CONFIDENCE_TONES[row.confidence]}>{CONF_SHORT[row.confidence]}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right text-sm text-muted-foreground">{row.findingCount || "—"}</TableCell>
                <TableCell>
                  {canEdit ? <StageSelect clinicId={row.id} stage={row.stage} /> : STAGE_LABELS[row.stage]}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(row.lastAuditedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
