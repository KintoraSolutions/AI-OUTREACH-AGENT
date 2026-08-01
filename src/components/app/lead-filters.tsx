"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { RecommendedService, ScoreConfidence } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CLINIC_CATEGORIES,
  FINDING_CATEGORY_LABELS,
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

export function LeadFilters() {
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

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:w-64">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search name, website, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search leads"
        />
      </div>
      <Select
        className="sm:w-48"
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
      <Select
        className="sm:w-44"
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
      <Select
        className="sm:w-40"
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
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <Checkbox
          checked={params.get("test") === "1"}
          onChange={(e) => update({ test: e.target.checked ? "1" : null })}
        />
        Include test data
      </label>

      {/* Score / audit filters */}
      <div className="flex w-full flex-col gap-3 border-t pt-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Score</span>
          <Input
            className="h-9 w-16"
            type="number"
            min={0}
            max={100}
            placeholder="min"
            aria-label="Minimum overall score"
            defaultValue={params.get("minScore") ?? ""}
            onBlur={(e) => update({ minScore: e.target.value })}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            className="h-9 w-16"
            type="number"
            min={0}
            max={100}
            placeholder="max"
            aria-label="Maximum overall score"
            defaultValue={params.get("maxScore") ?? ""}
            onBlur={(e) => update({ maxScore: e.target.value })}
          />
        </div>
        <Select
          className="sm:w-44"
          aria-label="Filter by recommended service"
          value={params.get("service") ?? ""}
          onChange={(e) => update({ service: e.target.value })}
        >
          <option value="">Any service</option>
          {Object.values(RecommendedService).map((s) => (
            <option key={s} value={s}>
              {SERVICE_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select
          className="sm:w-40"
          aria-label="Filter by confidence"
          value={params.get("confidence") ?? ""}
          onChange={(e) => update({ confidence: e.target.value })}
        >
          <option value="">Any confidence</option>
          {Object.values(ScoreConfidence).map((c) => (
            <option key={c} value={c}>
              {SCORE_CONFIDENCE_LABELS[c]}
            </option>
          ))}
        </Select>
        <Select
          className="sm:w-52"
          aria-label="Filter by finding type"
          value={params.get("finding") ?? ""}
          onChange={(e) => update({ finding: e.target.value })}
        >
          <option value="">Any finding</option>
          {FINDING_GROUPS.map(([category, rules]) => (
            <optgroup key={category} label={FINDING_CATEGORY_LABELS[category as keyof typeof FINDING_CATEGORY_LABELS]}>
              {rules.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Select
          className="sm:w-40"
          aria-label="Filter by audit status"
          value={params.get("audit") ?? ""}
          onChange={(e) => update({ audit: e.target.value })}
        >
          <option value="">Any audit status</option>
          <option value="scored">Scored</option>
          <option value="audited">Audited</option>
          <option value="unaudited">Not audited</option>
        </Select>
        <Input
          className="h-9 sm:w-40"
          type="date"
          aria-label="Audited since"
          defaultValue={params.get("auditedSince") ?? ""}
          onChange={(e) => update({ auditedSince: e.target.value })}
        />
      </div>
    </div>
  );
}
