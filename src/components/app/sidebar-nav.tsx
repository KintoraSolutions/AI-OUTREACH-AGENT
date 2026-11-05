"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  GraduationCap,
  HelpCircle,
  MailCheck,
  LayoutDashboard,
  Radar,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
}

interface NavGroup {
  id: string;
  /** Fluent group header. Omitted for the first group, which needs no label. */
  label?: string;
  items: NavItem[];
}

const section = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`);

export const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        match: (p) => p === "/dashboard",
      },
    ],
  },
  {
    id: "pipeline",
    label: "Pipeline",
    items: [
      { href: "/leads", label: "Leads", icon: Users, match: section("/leads") },
      { href: "/campaigns", label: "Campaigns", icon: Radar, match: section("/campaigns") },
      { href: "/review", label: "Review drafts", icon: MailCheck, match: section("/review") },
      { href: "/jobs", label: "Jobs", icon: Activity, match: section("/jobs") },
    ],
  },
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { href: "/settings", label: "Settings", icon: Settings, match: section("/settings") },
    ],
  },
  {
    id: "learn",
    label: "Learn",
    items: [
      { href: "/tutorial", label: "Tutorial", icon: GraduationCap, match: section("/tutorial") },
      { href: "/help", label: "Help", icon: HelpCircle, match: section("/help") },
    ],
  },
];

/**
 * Primary navigation list. Rendered three ways from one source of truth: the
 * expanded desktop rail, the 48px icon rail, and the mobile disclosure panel.
 *
 * In rail mode the label is carried by `aria-label` and a tooltip, so the
 * control keeps its accessible name when the text is hidden.
 */
export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className={cn("flex flex-col gap-1 py-2", collapsed ? "px-1" : "px-2")}>
      {NAV_GROUPS.map((group) => (
        <div key={group.id}>
          {group.label ? (
            <div
              aria-hidden="true"
              className={cn(
                "px-3 pb-1 pt-3 text-caption1 font-semibold text-[var(--fl-fg-3)]",
                collapsed && "hidden",
              )}
            >
              {group.label}
            </div>
          ) : null}
          {/* aria-label keeps the grouping announced even when the visible
              header is hidden in rail mode. */}
          <ul aria-label={group.label} className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;

              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={cn(
                    "relative flex items-center rounded-md transition-colors duration-100 ease-[var(--ease-easy)]",
                    collapsed ? "size-10 justify-center" : "h-9 gap-3 px-3",
                    active
                      ? "fl-selected-indicator bg-[var(--fl-brand-tint)] font-semibold text-[var(--fl-brand-text)]"
                      : "text-[var(--fl-fg-2)] hover:bg-[var(--fl-subtle-hover)] hover:text-[var(--fl-fg-1)]",
                  )}
                >
                  <Icon
                    className="size-5 shrink-0"
                    strokeWidth={active ? 2 : 1.75}
                    aria-hidden="true"
                  />
                  {collapsed ? null : <span className="truncate text-body1">{item.label}</span>}
                </Link>
              );

              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
