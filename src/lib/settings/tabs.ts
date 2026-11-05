/**
 * Settings section identifiers.
 *
 * Deliberately in `src/lib`, with no `"use client"` and no React imports: the
 * settings page is a SERVER component and needs `isSettingsTab` to validate
 * the `?tab=` query param before render. When this lived alongside the tab
 * component, Next.js refused the call at runtime with "Attempted to call
 * isSettingsTab() from the server but isSettingsTab is on the client" — a
 * boundary violation that typechecks cleanly and only fails in the browser.
 *
 * Icons stay in the client component; only values and labels belong here.
 */

export const SETTINGS_TABS = [
  { value: "organization", label: "Organization" },
  { value: "ai", label: "Your AI" },
  { value: "scoring", label: "Scoring" },
  { value: "integrations", label: "Integrations and data" },
] as const;

export type SettingsTabValue = (typeof SETTINGS_TABS)[number]["value"];

export function isSettingsTab(value: string | undefined): value is SettingsTabValue {
  return SETTINGS_TABS.some((t) => t.value === value);
}
