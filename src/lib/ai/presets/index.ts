import type { IndustryPreset } from "@/lib/ai/presets/types";
import { generalPreset } from "@/lib/ai/presets/general";
import { healthcarePreset } from "@/lib/ai/presets/healthcare";

/**
 * Industry preset registry. Adding an industry is one new file plus one line
 * here — nothing else in the app needs to change.
 */
export const DEFAULT_PRESET_KEY = "general";

export const PRESETS: Record<string, IndustryPreset> = {
  [generalPreset.key]: generalPreset,
  [healthcarePreset.key]: healthcarePreset,
};

/** A preset by key, falling back to the neutral preset for unknown keys. */
export function getPreset(key: string | null | undefined): IndustryPreset {
  return (key && PRESETS[key]) || PRESETS[DEFAULT_PRESET_KEY]!;
}

/** All presets, for pickers. */
export function listPresets(): IndustryPreset[] {
  return Object.values(PRESETS);
}

export type { IndustryPreset };
