"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { LeadSource, RecommendedService, ScoreConfidence } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

/** Rule id -> human label, for the finding chip. */
const FINDING_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_RULES.map((r) => [r.id, r.label]),
);

/**
 * Sort options. `audited.*` is served by `buildOrderBy` in the leads page and
 * is what the "Audited" column header toggles, so the header and this menu
 * always describe the same ordering.
 */
export const SORTS = [
  { value: "createdAt.desc", label: "Newest first" },
  { value: "createdAt.asc", label: "Oldest first" },
  { value: "name.asc", label: "Name A-Z" },
  { value: "name.desc", label: "Name Z-A" },
  { value: "audited.desc", label: "Recently audited" },
  { value: "audited.asc", label: "Least recently audited" },
  { value: "stage.asc", label: "Stage" },
];

const RANGES = [
  { value: "", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "12m", label: "Last 12 months" },
];

const RANGE_LABELS: Record<string, string> = Object.fromEntries(
  RANGES.filter((r) => r.value).map((r) => [r.value, r.label]),
);

const AUDIT_LABELS: Record<string, string> = {
  scored: "Scored",
  audited: "Audited",
  unaudited: "Not audited",
};

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

/** Every param the "Clear all" control resets. `sort` is an ordering, not a filter. */
const ALL_FILTER_KEYS = [...ADVANCED_KEYS, "q", "range", "test"] as const;

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1 block text-caption1 font-semibold text-[var(--fl-fg-2)]">{children}</span>
  );
}

interface Chip {
  key: string;
  label: string;
  value: string;
  /** Used verbatim in the remove button's accessible name. */
  removeLabel: string;
  onRemove: () => void;
}

/**
 * A removable pill for one active filter.
 *
 * Before this, nine filters lived inside a popover and the only trace of them
 * once it closed was a count badge — so the table could be silently narrowed
 * with no way to see what was applied, or to undo one thing.
 */
function FilterChip({ chip }: { chip: Chip }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--fl-brand-tint-stroke)] bg-[var(--fl-brand-tint)] py-0.5 pl-2 pr-0.5 text-caption1 text-[var(--fl-fg-1)]">
      <span className="text-[var(--fl-fg-2)]">{chip.label}</span>
      <span className="max-w-[14rem] truncate font-semibold">{chip.value}</span>
      <button
        type="button"
        aria-label={chip.removeLabel}
        onClick={chip.onRemove}
        className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-[var(--fl-fg-2)] transition-colors duration-100 ease-[var(--ease-easy)] hover:bg-[var(--fl-brand-tint-hover)] hover:text-[var(--fl-fg-1)]"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

export function LeadFilters({ viewsSlot }: { viewsSlot?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get("q") ?? "");

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

  // Keep the input in step when the URL changes from elsewhere (a saved view,
  // the back button, a chip being removed).
  const urlQuery = params.get("q") ?? "";
  useEffect(() => {
    // `urlQuery` is the only dependency: the functional update means this does
    // not close over `search`, so no exhaustive-deps suppression is needed.
    setSearch((prev) => (prev === urlQuery ? prev : urlQuery));
  }, [urlQuery]);

  const activeCount = ADVANCED_KEYS.filter((k) => (params.get(k) ?? "") !== "").length;

  function clearAdvanced() {
    update(Object.fromEntries(ADVANCED_KEYS.map((k) => [k, null])));
  }

  function clearAll() {
    setSearch("");
    update(Object.fromEntries(ALL_FILTER_KEYS.map((k) => [k, null])));
  }

  // ---- Active-filter chips -------------------------------------------------
  const chips: Chip[] = [];
  const get = (k: string) => params.get(k) ?? "";

  if (urlQuery) {
    chips.push({
      key: "q",
      label: "Search",
      value: urlQuery,
      removeLabel: "Remove search filter",
      onRemove: () => {
        setSearch("");
        update({ q: null });
      },
    });
  }
  if (get("category")) {
    chips.push({
      key: "category",
      label: "Category",
      value: get("category"),
      removeLabel: "Remove category filter",
      onRemove: () => update({ category: null }),
    });
  }
  if (get("stage")) {
    chips.push({
      key: "stage",
      label: "Stage",
      value: STAGE_LABELS[get("stage") as keyof typeof STAGE_LABELS] ?? get("stage"),
      removeLabel: "Remove stage filter",
      onRemove: () => update({ stage: null }),
    });
  }
  if (get("service")) {
    chips.push({
      key: "service",
      label: "Service",
      value: SERVICE_LABELS[get("service") as keyof typeof SERVICE_LABELS] ?? get("service"),
      removeLabel: "Remove service filter",
      onRemove: () => update({ service: null }),
    });
  }
  if (get("confidence")) {
    chips.push({
      key: "confidence",
      label: "Confidence",
      value:
        SCORE_CONFIDENCE_LABELS[get("confidence") as keyof typeof SCORE_CONFIDENCE_LABELS] ??
        get("confidence"),
      removeLabel: "Remove confidence filter",
      onRemove: () => update({ confidence: null }),
    });
  }
  if (get("minScore") || get("maxScore")) {
    chips.push({
      key: "score",
      label: "Score",
      value: `${get("minScore") || "0"} to ${get("maxScore") || "100"}`,
      removeLabel: "Remove score range filter",
      onRemove: () => update({ minScore: null, maxScore: null }),
    });
  }
  if (get("leadSource")) {
    chips.push({
      key: "leadSource",
      label: "Source",
      value: LEAD_SOURCE_LABELS[get("leadSource") as keyof typeof LEAD_SOURCE_LABELS] ?? get("leadSource"),
      removeLabel: "Remove lead source filter",
      onRemove: () => update({ leadSource: null }),
    });
  }
  if (get("finding")) {
    chips.push({
      key: "finding",
      label: "Finding",
      value: FINDING_LABELS[get("finding")] ?? get("finding"),
      removeLabel: "Remove finding filter",
      onRemove: () => update({ finding: null }),
    });
  }
  if (get("audit")) {
    chips.push({
      key: "audit",
      label: "Audit status",
      value: AUDIT_LABELS[get("audit")] ?? get("audit"),
      removeLabel: "Remove audit status filter",
      onRemove: () => update({ audit: null }),
    });
  }
  if (get("auditedSince")) {
    chips.push({
      key: "auditedSince",
      label: "Audited since",
      value: get("auditedSince"),
      removeLabel: "Remove audited since filter",
      onRemove: () => update({ auditedSince: null }),
    });
  }
  if (get("range")) {
    chips.push({
      key: "range",
      label: "Added",
      value: RANGE_LABELS[get("range")] ?? get("range"),
      removeLabel: "Remove date range filter",
      onRemove: () => update({ range: null }),
    });
  }
  if (get("test") === "1") {
    chips.push({
      key: "test",
      label: "Test data",
      value: "Included",
      removeLabel: "Remove test data filter",
      onRemove: () => update({ test: null }),
    });
  }

  return (
    <section
      aria-label="Lead filters"
      className="rounded-md border border-[var(--hairline)] bg-[var(--fl-bg-1)] shadow-2"
    >
      <div className="flex flex-wrap items-center gap-2 p-2.5">
        {/* Search */}
        <div className="relative min-w-[11rem] flex-1 sm:max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-[var(--fl-fg-3)]"
          />
          <Input
            className="h-9 rounded-md pl-8 text-body1"
            placeholder="Search name, website, phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search leads"
          />
        </div>

        {/* Advanced filters */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-9">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filters
              {activeCount > 0 ? (
                <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--fl-brand)] px-1 text-caption2 font-semibold tabular-nums text-[var(--fl-on-brand)]">
                  {activeCount}
                  <span className="sr-only"> filters applied</span>
                </span>
              ) : null}
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            aria-label="Advanced filters"
            className="max-h-[min(78vh,34rem)] w-[min(92vw,22rem)] overflow-y-auto p-0"
          >
            <div className="border-b border-[var(--hairline)] px-4 py-3">
              <p className="text-body1 font-semibold text-[var(--fl-fg-1)]">Filters</p>
              <p className="mt-0.5 text-caption1 text-[var(--fl-fg-2)]">
                Each choice is applied immediately and appears as a removable chip below the bar.
              </p>
            </div>

            <div className="space-y-3 p-4">
              <div>
                <FieldLabel>Category</FieldLabel>
                <Select
                  className="h-9 rounded-md text-body1"
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
                  className="h-9 rounded-md text-body1"
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
                    className="h-9 rounded-md text-body1"
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
                    className="h-9 rounded-md text-body1"
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
                    className="h-9 w-full rounded-md text-body1"
                    type="number"
                    min={0}
                    max={100}
                    placeholder="min"
                    aria-label="Minimum overall score"
                    defaultValue={params.get("minScore") ?? ""}
                    onBlur={(e) => update({ minScore: e.target.value })}
                  />
                  <span className="text-caption1 text-[var(--fl-fg-2)]">to</span>
                  <Input
                    className="h-9 w-full rounded-md text-body1"
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
                  className="h-9 rounded-md text-body1"
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
                  className="h-9 rounded-md text-body1"
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
                  <FieldLabel>Audit status</FieldLabel>
                  <Select
                    className="h-9 rounded-md text-body1"
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
                    className="h-9 rounded-md text-body1"
                    type="date"
                    aria-label="Audited since"
                    defaultValue={params.get("auditedSince") ?? ""}
                    onChange={(e) => update({ auditedSince: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-[var(--hairline)] px-4 py-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAdvanced}
                disabled={activeCount === 0}
              >
                Reset these
              </Button>
              <PopoverClose asChild>
                <Button type="button" size="sm">
                  Done
                </Button>
              </PopoverClose>
            </div>
          </PopoverContent>
        </Popover>

        {/* Sort */}
        <Select
          className="h-9 rounded-md text-body1 sm:w-[11.5rem]"
          aria-label="Sort leads"
          value={params.get("sort") ?? "createdAt.desc"}
          onChange={(e) => update({ sort: e.target.value })}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>

        {/* Date range */}
        <Select
          className="h-9 rounded-md text-body1 sm:w-[9rem]"
          aria-label="Filter by date added"
          value={params.get("range") ?? ""}
          onChange={(e) => update({ range: e.target.value })}
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>

        {/* Saved views, merged into the same bar rather than stacked below it. */}
        {viewsSlot}

        {/* Test data toggle */}
        <label className="flex cursor-pointer select-none items-center gap-2 text-body1 text-[var(--fl-fg-2)]">
          <Checkbox
            checked={params.get("test") === "1"}
            onChange={(e) => update({ test: e.target.checked ? "1" : null })}
          />
          Include test data
        </label>
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--hairline)] px-2.5 py-2">
          <h2 className="mr-0.5 text-caption1 font-semibold text-[var(--fl-fg-3)]">
            Active filters
          </h2>
          {chips.map((chip) => (
            <FilterChip key={chip.key} chip={chip} />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-0.5 h-6 px-2"
            onClick={clearAll}
          >
            Clear all
          </Button>
        </div>
      ) : null}
    </section>
  );
}
