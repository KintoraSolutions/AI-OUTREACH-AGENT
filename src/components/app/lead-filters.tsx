"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { LeadSource, RecommendedService, ScoreConfidence } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  CLINIC_CATEGORIES,
  FINDING_CATEGORY_LABELS,
  LEAD_SOURCE_LABELS,
  SCORE_CONFIDENCE_LABELS,
  SERVICE_LABELS,
  STAGE_LABELS,
  STAGE_ORDER,
} from "@/lib/leads/constants";
import { DEFAULT_RULES } from "@/lib/scoring/rules";

const FINDING_GROUPS = Object.entries(
  DEFAULT_RULES.reduce<Record<string, { id: string; label: string }[]>>((acc, r) => {
    (acc[r.category] ??= []).push({ id: r.id, label: r.label });
    return acc;
  }, {}),
);

const SORTS = [
  { value: "createdAt.desc", label: "Newest first" },
  { value: "createdAt.asc", label: "Oldest first" },
  { value: "name.asc", label: "Name A-Z" },
  { value: "name.desc", label: "Name Z-A" },
  { value: "stage.asc", label: "Stage" },
];

const RANGES = [
  { value: "", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
];

// Advanced filters that live inside the Filters popover (drives the count badge).
const ADVANCED_KEYS = [
  "category",
  "stage",
  "service",
  "confidence",
  "finding",
  "audit",
  "minScore",
  "maxScore",
  "auditedSince",
  "leadSource",
] as const;

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.03em] text-muted-foreground">
      {children}
    </span>
  );
}

export function LeadFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  function update(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "") sp.delete(key);
      else sp.set(key, value);
    }
    sp.delete("page");
    startTransition(() => router.replace(`${pathname}?${sp.toString()}`));
  }

  // Debounce the free-text search.
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (search === current) return;
    const t = setTimeout(() => update({ q: search }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeCount = ADVANCED_KEYS.filter((k) => (params.get(k) ?? "") !== "").length;

  function clearAdvanced() {
    update(Object.fromEntries(ADVANCED_KEYS.map((k) => [k, null])));
  }

  return (
    <div className="glass flex flex-wrap items-center gap-2 rounded-[8px] px-2.5 py-2">
      {/* Search */}
      <div className="relative min-w-[10rem] flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-8 text-[13px]"
          placeholder="Search name, website, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search leads"
        />
      </div>

      {/* Filters popover */}
      <div className="relative" ref={popoverRef}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((o) => !o)}
        >
          <SlidersHorizontal className="size-4" />
          Filters
          {activeCount > 0 ? (
            <span className="ml-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--mint-dim)] px-1 text-[11px] font-semibold tabular-nums text-[var(--mint)]">
              {activeCount}
            </span>
          ) : null}
        </Button>
        {open ? (
          <div
            role="dialog"
            aria-label="Advanced filters"
            className="glass-strong absolute right-0 z-40 mt-2 max-h-[min(78vh,540px)] w-[min(92vw,340px)] overflow-y-auto rounded-[10px] p-3"
          >
            <div className="space-y-3">
              <div>
                <FieldLabel>Category</FieldLabel>
                <Select
                  aria-label="Filter by category"
                  value={params.get("category") ?? ""}
                  onChange={(e) => update({ category: e.target.value })}
                >
                  <option value="">All categories</option>
                  {CLINIC_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <FieldLabel>Stage</FieldLabel>
                <Select
                  aria-label="Filter by stage"
                  value={params.get("stage") ?? ""}
                  onChange={(e) => update({ stage: e.target.value })}
                >
                  <option value="">All stages</option>
                  {STAGE_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STAGE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Service</FieldLabel>
                  <Select
                    aria-label="Filter by recommended service"
                    value={params.get("service") ?? ""}
                    onChange={(e) => update({ service: e.target.value })}
                  >
                    <option value="">Any</option>
                    {Object.values(RecommendedService).map((s) => (
                      <option key={s} value={s}>
                        {SERVICE_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <FieldLabel>Confidence</FieldLabel>
                  <Select
                    aria-label="Filter by confidence"
                    value={params.get("confidence") ?? ""}
                    onChange={(e) => update({ confidence: e.target.value })}
                  >
                    <option value="">Any</option>
                    {Object.values(ScoreConfidence).map((c) => (
                      <option key={c} value={c}>
                        {SCORE_CONFIDENCE_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <FieldLabel>Lead score</FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    className="h-9 w-full"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="min"
                    aria-label="Minimum overall score"
                    defaultValue={params.get("minScore") ?? ""}
                    onBlur={(e) => update({ minScore: e.target.value })}
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    className="h-9 w-full"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="max"
                    aria-label="Maximum overall score"
                    defaultValue={params.get("maxScore") ?? ""}
                    onBlur={(e) => update({ maxScore: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <FieldLabel>Lead source</FieldLabel>
                <Select
                  aria-label="Filter by lead source"
                  value={params.get("leadSource") ?? ""}
                  onChange={(e) => update({ leadSource: e.target.value })}
                >
                  <option value="">Any source</option>
                  {Object.values(LeadSource).map((s) => (
                    <option key={s} value={s}>
                      {LEAD_SOURCE_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <FieldLabel>Findings</FieldLabel>
                <Select
                  aria-label="Filter by finding type"
                  value={params.get("finding") ?? ""}
                  onChange={(e) => update({ finding: e.target.value })}
                >
                  <option value="">Any finding</option>
                  {FINDING_GROUPS.map(([category, rules]) => (
                    <optgroup
                      key={category}
                      label={FINDING_CATEGORY_LABELS[category as keyof typeof FINDING_CATEGORY_LABELS]}
                    >
                      {rules.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Audited status</FieldLabel>
                  <Select
                    aria-label="Filter by audit status"
                    value={params.get("audit") ?? ""}
                    onChange={(e) => update({ audit: e.target.value })}
                  >
                    <option value="">Any</option>
                    <option value="scored">Scored</option>
                    <option value="audited">Audited</option>
                    <option value="unaudited">Not audited</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel>Audited since</FieldLabel>
                  <Input
                    className="h-9"
                    type="date"
                    aria-label="Audited since"
                    defaultValue={params.get("auditedSince") ?? ""}
                    onChange={(e) => update({ auditedSince: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-[var(--hairline)] pt-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearAdvanced}
                  disabled={activeCount === 0}
                >
                  Clear all
                </Button>
                <Button type="button" size="sm" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Date range */}
      <Select
        className="h-9 sm:w-[130px]"
        aria-label="Date range"
        value={params.get("range") ?? ""}
        onChange={(e) => update({ range: e.target.value })}
      >
        {RANGES.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>

      {/* Sort */}
      <Select
        className="h-9 sm:w-[140px]"
        aria-label="Sort"
        value={params.get("sort") ?? "createdAt.desc"}
        onChange={(e) => update({ sort: e.target.value })}
      >
        {SORTS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>

      {/* Test data toggle */}
      <label className="flex select-none items-center gap-2 text-xs text-muted-foreground">
        <Checkbox
          checked={params.get("test") === "1"}
          onChange={(e) => update({ test: e.target.checked ? "1" : null })}
        />
        Include test data
      </label>
    </div>
  );
}
