import { FindingCategory, RecommendedService } from "@prisma/client";
import type { OfferingSlot, OrgAiProfile } from "@/lib/ai/org-ai-profile";

/**
 * Resolves the org's own names for the internal offering slots, so no product
 * name is ever hardcoded in the UI, the scoring explanations, or the prompt.
 *
 * The two non-pitchable categories (contactability, business fit) describe the
 * LEAD rather than an offering, so their labels stay fixed.
 */

const FIXED_CATEGORY_LABELS: Partial<Record<FindingCategory, string>> = {
  [FindingCategory.CONTACTABILITY]: "Contactability",
  [FindingCategory.BUSINESS_FIT]: "Business fit",
};

/** Slot for a category, or null when the category is not an offering area. */
export function slotForCategory(category: FindingCategory): OfferingSlot | null {
  if (category === FindingCategory.WEBSITE) return "WEBSITE";
  if (category === FindingCategory.SOFTWARE) return "SOFTWARE";
  if (category === FindingCategory.KLEARQ) return "KLEARQ";
  return null;
}

/** Slot for a recommended service, or null for COMBINED / NONE. */
export function slotForService(service: RecommendedService): OfferingSlot | null {
  if (service === RecommendedService.WEBSITE) return "WEBSITE";
  if (service === RecommendedService.SOFTWARE) return "SOFTWARE";
  if (service === RecommendedService.KLEARQ) return "KLEARQ";
  return null;
}

export function serviceLabel(profile: OrgAiProfile, service: RecommendedService): string {
  if (service === RecommendedService.COMBINED) return "Combined";
  if (service === RecommendedService.NONE) return "None";
  const slot = slotForService(service);
  const offering = slot ? profile.offerings.find((o) => o.slot === slot) : null;
  return offering?.name || service;
}

export function categoryLabel(profile: OrgAiProfile, category: FindingCategory): string {
  const fixed = FIXED_CATEGORY_LABELS[category];
  if (fixed) return fixed;
  const slot = slotForCategory(category);
  const offering = slot ? profile.offerings.find((o) => o.slot === slot) : null;
  return offering?.name || category;
}

export function shortLabel(profile: OrgAiProfile, slot: OfferingSlot): string {
  const offering = profile.offerings.find((o) => o.slot === slot);
  return offering?.shortLabel || slot.slice(0, 4);
}

/** Full label maps, for components and for injection into the scoring engine. */
export function buildServiceLabels(profile: OrgAiProfile): Record<RecommendedService, string> {
  return {
    WEBSITE: serviceLabel(profile, RecommendedService.WEBSITE),
    SOFTWARE: serviceLabel(profile, RecommendedService.SOFTWARE),
    KLEARQ: serviceLabel(profile, RecommendedService.KLEARQ),
    COMBINED: "Combined",
    NONE: "None",
  };
}

export function buildCategoryLabels(profile: OrgAiProfile): Record<FindingCategory, string> {
  return {
    WEBSITE: categoryLabel(profile, FindingCategory.WEBSITE),
    SOFTWARE: categoryLabel(profile, FindingCategory.SOFTWARE),
    KLEARQ: categoryLabel(profile, FindingCategory.KLEARQ),
    CONTACTABILITY: "Contactability",
    BUSINESS_FIT: "Business fit",
  };
}
