"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Confidence, FindingCategory } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONFIDENCE_LABELS, FINDING_CATEGORY_LABELS } from "@/lib/leads/constants";
import { DEFAULT_RULES } from "@/lib/scoring/rules";
import { initialFormState } from "@/lib/actions/form";
import { updateScoringRules } from "@/app/(dashboard)/leads/audit-actions";
import type { ScoringConfig } from "@/lib/scoring/types";

const CATS = Object.values(FindingCategory);
const CONFS = Object.values(Confidence);

export function ScoringRulesForm({
  config,
  revision,
  canEdit,
}: {
  config: ScoringConfig;
  revision: number;
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [reason, setReason] = useState("");
  const pointsById = new Map(config.rules.map((r) => [r.id, r.points]));

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canEdit) return;
    const fd = new FormData(e.currentTarget);
    const ruleWeights: Record<string, number> = {};
    for (const r of DEFAULT_RULES) {
      const v = Number(fd.get(`rule_${r.id}`));
      if (Number.isFinite(v)) ruleWeights[r.id] = v;
    }
    const categoryCaps: Record<string, number> = {};
    for (const c of CATS) {
      const v = Number(fd.get(`cap_${c}`));
      if (Number.isFinite(v)) categoryCaps[c] = v;
    }
    const confidenceMultipliers: Record<string, number> = {};
    for (const c of CONFS) {
      const v = Number(fd.get(`mult_${c}`));
      if (Number.isFinite(v)) confidenceMultipliers[c] = v;
    }
    const overrides = {
      ruleWeights,
      categoryCaps,
      confidenceMultipliers,
      recommendation: { floor: Number(fd.get("floor")), combinedMargin: Number(fd.get("margin")) },
    };

    const payload = new FormData();
    payload.set("config", JSON.stringify(overrides));
    payload.set("reason", reason);

    start(async () => {
      const res = await updateScoringRules(initialFormState, payload);
      if (res.ok) {
        toast.success(res.message ?? "Saved.");
        setReason("");
        router.refresh();
      } else toast.error(res.error ?? "Could not save scoring rules.");
    });
  }

  const byCategory = CATS.map((cat) => ({
    cat,
    rules: DEFAULT_RULES.filter((r) => r.category === cat),
  }));

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <p className="text-xs text-muted-foreground">
        Effective ruleset: <span className="font-medium">{config.version}</span>. Saving stores a new
        revision; existing scores keep the version that produced them until you recalculate.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-semibold">Category caps</legend>
          {CATS.map((c) => (
            <div key={c} className="flex items-center justify-between gap-2">
              <Label htmlFor={`cap_${c}`} className="text-xs">{FINDING_CATEGORY_LABELS[c]}</Label>
              <Input
                id={`cap_${c}`}
                name={`cap_${c}`}
                type="number"
                min={0}
                max={100}
                defaultValue={config.categoryCaps[c]}
                disabled={!canEdit}
                className="h-8 w-20"
              />
            </div>
          ))}
        </fieldset>

        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-semibold">Confidence multipliers</legend>
          {CONFS.map((c) => (
            <div key={c} className="flex items-center justify-between gap-2">
              <Label htmlFor={`mult_${c}`} className="text-xs">{CONFIDENCE_LABELS[c]}</Label>
              <Input
                id={`mult_${c}`}
                name={`mult_${c}`}
                type="number"
                min={0}
                max={1}
                step={0.05}
                defaultValue={config.confidenceMultipliers[c]}
                disabled={!canEdit}
                className="h-8 w-20"
              />
            </div>
          ))}
        </fieldset>

        <fieldset className="space-y-2 rounded-md border p-3">
          <legend className="px-1 text-xs font-semibold">Recommendation thresholds</legend>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="floor" className="text-xs">Minimum floor</Label>
            <Input id="floor" name="floor" type="number" min={0} max={100} defaultValue={config.recommendation.floor} disabled={!canEdit} className="h-8 w-20" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="margin" className="text-xs">Combined margin</Label>
            <Input id="margin" name="margin" type="number" min={0} max={50} defaultValue={config.recommendation.combinedMargin} disabled={!canEdit} className="h-8 w-20" />
          </div>
        </fieldset>
      </div>

      <div className="space-y-3">
        {byCategory.map(({ cat, rules }) => (
          <div key={cat} className="rounded-md border">
            <div className="border-b px-3 py-2 text-sm font-medium">{FINDING_CATEGORY_LABELS[cat]}</div>
            <ul className="divide-y">
              {rules.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm">{r.label}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.description}</p>
                  </div>
                  <Input
                    name={`rule_${r.id}`}
                    type="number"
                    min={0}
                    max={50}
                    defaultValue={pointsById.get(r.id) ?? r.points}
                    disabled={!canEdit}
                    aria-label={`${r.label} points`}
                    className="h-8 w-20 shrink-0"
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-end gap-3 border-t pt-4">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="rules-reason">Reason for change (audit log)</Label>
            <Input
              id="rules-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Increase phone-operations weighting for multi-location clinics"
              maxLength={500}
            />
          </div>
          <Button type="submit" disabled={pending || reason.trim().length < 3}>
            {pending ? "Saving…" : "Save scoring rules"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Only admins can change scoring rules. Current revision {revision}.</p>
      )}
    </form>
  );
}
