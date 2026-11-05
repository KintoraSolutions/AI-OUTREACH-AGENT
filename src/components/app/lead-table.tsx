"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown, PencilLine } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StageSelect } from "@/components/app/stage-select";
import { StageBadge, FLUENT_BADGE_CLASS } from "@/components/app/stage-badge";
import { HelpTip } from "@/components/app/help-tip";
import { Radar } from "@/components/app/charts";
import {
  SCORE_CONFIDENCE_LABELS,
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

/** Fluent DetailsList column head: 12px semibold sentence case on tertiary ink.
 *  The primitive still ships 10.5px uppercase mono at roughly 3.5:1. */
const HEAD_CLASS =
  "sticky top-0 z-10 h-9 border-b border-[var(--hairline-strong)] bg-[var(--fl-bg-1)] px-3 font-sans text-caption1 font-semibold normal-case tracking-normal text-[var(--fl-fg-3)]";

const DENSITY_KEY = "leads.density";
type Density = "comfortable" | "compact";

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

/** Short names for the three opportunity areas, from the org's AI profile. */
export interface AreaLabels {
  website: string;
  software: string;
  phone: string;
}

const FALLBACK_AREA_LABELS: AreaLabels = { website: "Web", software: "Software", phone: "Phone" };

function abbrev(label: string): string {
  return label.slice(0, 3);
}

/** Compact numeric profile: the five scoring dimensions without the SVG. */
function ProfileNumbers({ row, areaLabels }: { row: LeadRow; areaLabels: AreaLabels }) {
  const dims: { key: string; full: string; value: number | null }[] = [
    { key: abbrev(areaLabels.website), full: areaLabels.website, value: row.websiteScore },
    { key: abbrev(areaLabels.software), full: areaLabels.software, value: row.softwareScore },
    { key: abbrev(areaLabels.phone), full: areaLabels.phone, value: row.klearqScore },
    { key: "Con", full: "Contactability", value: row.contactabilityScore },
    { key: "Fit", full: "Business fit", value: row.businessFitScore },
  ];
  return (
    <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-caption1 tabular-nums text-[var(--fl-fg-2)]">
      {dims.map((d) => (
        <span key={d.full}>
          <span aria-hidden="true" className="text-[var(--fl-fg-3)]">
            {d.key}
          </span>
          <span className="sr-only">{d.full}</span> {d.value ?? "—"}
        </span>
      ))}
    </div>
  );
}

/** A tooltip-backed marker that also says what it means in words. */
function MarkerTag({
  icon: Icon,
  text,
  label,
  tooltip,
}: {
  icon: typeof AlertTriangle;
  text: string;
  label: string;
  tooltip: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex shrink-0 cursor-help items-center gap-1 rounded-sm px-1 py-0.5 text-caption1 font-semibold text-[var(--fl-warning-fg)] transition-colors duration-100 ease-[var(--ease-easy)] hover:bg-[var(--fl-subtle-hover)]"
        >
          <Icon className="size-3 fl-keep-color" aria-hidden="true" />
          {text}
        </button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

/**
 * A column head that toggles the existing `sort` query param.
 *
 * Sorting used to live only in a detached <Select> in the filter bar, so the
 * table gave no indication of which column ordered it. `aria-sort` on the
 * <th> is what makes that state available to a screen reader.
 */
function SortHead({
  field,
  label,
  defaultDir,
  className,
  children,
}: {
  field: "name" | "audited";
  label: string;
  defaultDir: "asc" | "desc";
  className?: string;
  children?: ReactNode;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const [curField, curDir] = (params.get("sort") ?? "createdAt.desc").split(".");
  const active = curField === field;
  const dir = active && (curDir === "asc" || curDir === "desc") ? curDir : null;
  const nextDir = dir === "asc" ? "desc" : dir === "desc" ? "asc" : defaultDir;

  const sp = new URLSearchParams(params.toString());
  sp.set("sort", `${field}.${nextDir}`);
  sp.delete("page");

  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ChevronsUpDown;

  return (
    <TableHead
      aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
      className={cn(HEAD_CLASS, "p-0", className)}
    >
      <Link
        href={`${pathname}?${sp.toString()}`}
        scroll={false}
        className={cn(
          "group inline-flex h-9 w-full items-center gap-1.5 px-3 transition-colors duration-100 ease-[var(--ease-easy)] hover:bg-[var(--fl-subtle-hover)] hover:text-[var(--fl-fg-1)]",
          active && "text-[var(--fl-brand-text)]",
        )}
      >
        {label}
        <Icon
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0",
            active ? "opacity-100" : "opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60",
          )}
        />
        {/* `aria-sort` on the <th> already reports the current order, so this
            says only what activating the link will do. */}
        <span className="sr-only">
          {`, activate to sort ${nextDir === "asc" ? "ascending" : "descending"}`}
        </span>
        {children}
      </Link>
    </TableHead>
  );
}

function DensityToggle({
  value,
  onChange,
}: {
  value: Density;
  onChange: (next: Density) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Row density"
      className="inline-flex items-center gap-0.5 rounded-md border border-[var(--fl-stroke-1)] bg-[var(--fl-bg-1)] p-0.5"
    >
      {(["comfortable", "compact"] as const).map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={value === d}
          onClick={() => onChange(d)}
          className={cn(
            "cursor-pointer rounded-sm px-2 py-1 text-caption1 font-semibold capitalize transition-colors duration-100 ease-[var(--ease-easy)]",
            value === d
              ? "bg-[var(--fl-brand-tint)] text-[var(--fl-brand-text)]"
              : "text-[var(--fl-fg-2)] hover:bg-[var(--fl-subtle-hover)] hover:text-[var(--fl-fg-1)]",
          )}
        >
          {d}
        </button>
      ))}
    </div>
  );
}

export function LeadTable({
  rows,
  canEdit,
  areaLabels = FALLBACK_AREA_LABELS,
}: {
  rows: LeadRow[];
  canEdit: boolean;
  areaLabels?: AreaLabels;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState<PipelineStage>(PipelineStage.QUALIFIED);
  const [density, setDensity] = useState<Density>("comfortable");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Restore the remembered density after hydration; the server cannot read
  // localStorage, so doing it during render would desync the two trees.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(DENSITY_KEY);
      if (stored === "compact" || stored === "comfortable") setDensity(stored);
    } catch {
      /* private mode / blocked storage: the default is fine */
    }
  }, []);

  function changeDensity(next: Density) {
    setDensity(next);
    try {
      window.localStorage.setItem(DENSITY_KEY, next);
    } catch {
      /* non-persistent is acceptable */
    }
  }

  const compact = density === "compact";
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
    <div className="space-y-2">
      {/* Command strip: bulk actions on the left, view controls on the right. */}
      <div className="flex flex-wrap items-center gap-2">
        {canEdit && selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--fl-brand-tint-stroke)] bg-[var(--fl-brand-tint)] px-2.5 py-1.5 text-body1 duration-150 animate-in fade-in-0 slide-in-from-top-1">
            <span className="font-semibold tabular-nums">{selected.size} selected</span>
            <label className="flex items-center gap-2 text-[var(--fl-fg-2)]">
              Set stage to
              <Select
                className="h-8 w-44 rounded-md text-body1"
                value={bulkStage}
                onChange={(e) => setBulkStage(e.target.value as PipelineStage)}
              >
                {STAGE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </label>
            <Button size="sm" onClick={applyBulk} disabled={pending}>
              Apply
            </Button>
            <span className="mx-1 h-4 w-px bg-[var(--hairline-strong)]" aria-hidden="true" />
            <Button size="sm" variant="outline" onClick={applyDoNotContact} disabled={pending}>
              Mark do-not-contact
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            {pending ? <Spinner size="xs" label="Updating selected leads" showLabel /> : null}
          </div>
        ) : null}

        <div className="ml-auto">
          <DensityToggle value={density} onChange={changeDensity} />
        </div>
      </div>

      <div
        className={cn(
          "overflow-hidden rounded-md border border-[var(--hairline)] bg-[var(--fl-bg-1)] shadow-2",
          // Give the primitive's own scroll container a bounded height so the
          // sticky column heads actually have a scrollport to stick to.
          "[&>div]:max-h-[min(72vh,46rem)] [&>div]:overflow-auto",
          "[&_td]:px-3 [&_th]:align-middle",
          compact ? "[&_td]:py-1" : "[&_td]:py-2.5",
        )}
      >
        <Table className="text-body1">
          {/* The rule lives on the sticky <th> cells, not on <thead>: a border on
              the thead box would stay behind at the top of the table while the
              cells travel with the scroll. */}
          <TableHeader className="border-b-0 [&_tr]:border-b-0">
            <TableRow className="hover:bg-transparent">
              {canEdit ? (
                <TableHead className={cn(HEAD_CLASS, "w-8")}>
                  <Checkbox
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label={allSelected ? "Clear selection" : "Select all leads on this page"}
                  />
                </TableHead>
              ) : null}

              <SortHead field="name" label="Clinic" defaultDir="asc" />

              <TableHead className={cn(HEAD_CLASS, "text-center")}>
                <span className="inline-flex items-center gap-1">
                  Overall
                  <HelpTip slug="how-scoring-works" label="How scoring works" />
                </span>
              </TableHead>

              <TableHead className={cn(HEAD_CLASS, "text-center")}>Performance profile</TableHead>
              <TableHead className={HEAD_CLASS}>Service and confidence</TableHead>
              <TableHead className={cn(HEAD_CLASS, "text-right")}>Findings</TableHead>
              <TableHead className={HEAD_CLASS}>Stage</TableHead>

              <SortHead field="audited" label="Audited" defaultDir="desc" />
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={selected.has(row.id) ? "selected" : undefined}
                className="hover:bg-[var(--fl-subtle-hover)] data-[state=selected]:bg-[var(--fl-brand-tint)]"
              >
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
                <TableCell className="max-w-[17rem]">
                  <Link
                    href={`/leads/${row.id}`}
                    className="block truncate font-semibold text-[var(--fl-fg-1)] hover:text-[var(--fl-brand-text)] hover:underline"
                  >
                    {row.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-1.5 text-caption1 text-[var(--fl-fg-2)]">
                    <span className="truncate">{row.category ?? "Uncategorized"}</span>
                    {row.isTestData ? (
                      <Badge tone="neutral" className={FLUENT_BADGE_CLASS}>
                        Test
                      </Badge>
                    ) : null}
                    {row.duplicateCandidate ? (
                      <MarkerTag
                        icon={AlertTriangle}
                        text="Possible duplicate"
                        label={`Possible duplicate of another lead named like ${row.name}`}
                        tooltip="Another lead in this organization has a near-identical name. Open both before contacting either."
                      />
                    ) : null}
                  </div>
                  {row.location && !compact ? (
                    <div className="mt-0.5 truncate text-caption1 text-[var(--fl-fg-3)]">
                      {row.location}
                    </div>
                  ) : null}
                </TableCell>

                {/* Overall score */}
                <TableCell className="text-center">
                  {row.overallScore === null ? (
                    <span className="text-[var(--fl-fg-3)]">
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">Not scored yet</span>
                    </span>
                  ) : (
                    <div className="inline-flex flex-col items-center gap-1">
                      <span
                        className={cn(
                          "text-subtitle1 font-semibold leading-none tabular-nums",
                          row.overallScore >= 80
                            ? "text-[var(--fl-brand-text)]"
                            : row.overallScore >= 60
                              ? "text-[var(--fl-fg-1)]"
                              : "text-[var(--fl-fg-2)]",
                        )}
                      >
                        {row.overallScore}
                        <span className="sr-only"> out of 100</span>
                      </span>
                      {/* The bar repeats the number as a length, so the strength
                          of a lead is readable without relying on the hue. */}
                      {!compact ? (
                        <span
                          aria-hidden="true"
                          className="block h-1 w-10 overflow-hidden rounded-full bg-[var(--fl-bg-4)]"
                        >
                          <span
                            className="block h-full rounded-full bg-[var(--fl-brand)] fl-keep-color"
                            style={{ width: `${Math.max(0, Math.min(100, row.overallScore))}%` }}
                          />
                        </span>
                      ) : null}
                      {row.manualOverride ? (
                        <MarkerTag
                          icon={PencilLine}
                          text="Manual"
                          label="Manual score override"
                          tooltip="Someone set this score by hand. It replaces the computed score everywhere, including in filters."
                        />
                      ) : null}
                    </div>
                  )}
                </TableCell>

                {/* Performance profile: radar only at comfortable density on wide
                    screens; 25 inline SVG charts is a lot of noise when scanning. */}
                <TableCell>
                  {compact ? (
                    <ProfileNumbers row={row} areaLabels={areaLabels} />
                  ) : (
                    <>
                      <div className="hidden justify-center xl:flex">
                        <Radar
                          size={58}
                          values={[
                            { label: areaLabels.website, value: row.websiteScore },
                            { label: areaLabels.software, value: row.softwareScore },
                            { label: areaLabels.phone, value: row.klearqScore },
                            { label: "Contactability", value: row.contactabilityScore },
                            { label: "Business fit", value: row.businessFitScore },
                          ]}
                        />
                      </div>
                      <div className="xl:hidden">
                        <ProfileNumbers row={row} areaLabels={areaLabels} />
                      </div>
                    </>
                  )}
                </TableCell>

                {/* Service and confidence */}
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {row.recommendedService ? (
                      <Badge
                        tone={SERVICE_TONES[row.recommendedService]}
                        className={FLUENT_BADGE_CLASS}
                      >
                        {SERVICE_LABELS[row.recommendedService]}
                      </Badge>
                    ) : (
                      <span className="text-[var(--fl-fg-3)]">
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">No recommended service yet</span>
                      </span>
                    )}
                    {row.confidence ? (
                      <Badge
                        tone={SCORE_CONFIDENCE_TONES[row.confidence]}
                        className={FLUENT_BADGE_CLASS}
                      >
                        <span aria-hidden="true">{CONF_SHORT[row.confidence]}</span>
                        <span className="sr-only">{SCORE_CONFIDENCE_LABELS[row.confidence]}</span>
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>

                {/* Findings */}
                <TableCell className="text-right">
                  <Link
                    href={`/leads/${row.id}`}
                    className="tabular-nums text-[var(--fl-fg-2)] hover:text-[var(--fl-brand-text)] hover:underline"
                  >
                    {row.findingCount === 0
                      ? "None"
                      : `${row.findingCount} ${row.findingCount === 1 ? "finding" : "findings"}`}
                    <span className="sr-only"> for {row.name}</span>
                  </Link>
                </TableCell>

                {/* Stage */}
                <TableCell>
                  {canEdit ? (
                    <StageSelect
                      clinicId={row.id}
                      stage={row.stage}
                      className="w-full min-w-[8.5rem] rounded-md text-body1"
                    />
                  ) : (
                    <StageBadge stage={row.stage} />
                  )}
                </TableCell>

                {/* Audited */}
                <TableCell className="whitespace-nowrap text-[var(--fl-fg-2)]">
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
