"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, Plug, SlidersHorizontal, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SETTINGS_TABS,
  isSettingsTab,
  type SettingsTabValue,
} from "@/lib/settings/tabs";

/**
 * Settings sections.
 *
 * Nine cards used to sit in one unbroken scroll with no anchors and no
 * sub-navigation, so reaching retention meant scrolling past the AI profile,
 * the company profile, the voice editor and the scoring rules.
 *
 * The tab values live in `@/lib/settings/tabs` because the settings page is a
 * server component and must validate `?tab=` before render; only the icons are
 * client-side.
 */
const TAB_ICONS: Record<SettingsTabValue, typeof Building2> = {
  organization: Building2,
  ai: Sparkles,
  scoring: SlidersHorizontal,
  integrations: Plug,
};

export function SettingsTabs({
  defaultTab,
  organization,
  ai,
  scoring,
  integrations,
}: {
  defaultTab: SettingsTabValue;
  organization: ReactNode;
  ai: ReactNode;
  scoring: ReactNode;
  integrations: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // The URL is the source of truth, so a tab is linkable and survives a refresh
  // or a browser Back. `defaultTab` covers the Google OAuth callback, which
  // returns to `?connected=google` with no tab of its own.
  const raw = params.get("tab") ?? undefined;
  const value: SettingsTabValue = isSettingsTab(raw) ? raw : defaultTab;

  function onValueChange(next: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("tab", next);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  const panels: Record<SettingsTabValue, ReactNode> = {
    organization,
    ai,
    scoring,
    integrations,
  };

  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList aria-label="Settings sections">
        {SETTINGS_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.value];
          return (
            <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5">
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>

      {SETTINGS_TABS.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          // Mounted even while inactive so a half-typed form is not thrown away
          // by switching tabs. Radix leaves `hidden` off under forceMount, so
          // the inactive panel is taken out of the layout and the a11y tree here.
          forceMount
          className="space-y-5 data-[state=inactive]:hidden"
        >
          {panels[tab.value]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** Section heading for a tab panel: keeps h1 -> h2 -> h3 intact under the tabs. */
export function SettingsSectionHeader({
  title,
  description,
  help,
}: {
  title: string;
  description: string;
  help?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <h2 className="text-subtitle1 font-semibold text-[var(--fl-fg-1)]">{title}</h2>
        {help}
      </div>
      <p className="max-w-2xl text-body1 text-[var(--fl-fg-2)]">{description}</p>
    </div>
  );
}
