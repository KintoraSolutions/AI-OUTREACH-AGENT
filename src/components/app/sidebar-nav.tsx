"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Settings, Radar, Activity, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
}

const items: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    match: (p) => p === "/dashboard",
  },
  {
    href: "/leads",
    label: "Leads",
    icon: Users,
    match: (p) => p === "/leads" || p.startsWith("/leads/"),
  },
  {
    href: "/campaigns",
    label: "Campaigns",
    icon: Radar,
    match: (p) => p === "/campaigns" || p.startsWith("/campaigns/"),
  },
  {
    href: "/jobs",
    label: "Jobs",
    icon: Activity,
    match: (p) => p === "/jobs" || p.startsWith("/jobs/"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    match: (p) => p === "/settings" || p.startsWith("/settings/"),
  },
];

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2.5 py-1.5">
      {items.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex h-[41px] items-center gap-2.5 rounded-[7px] px-2.5 text-[14px] transition-colors",
              active
                ? "bg-[var(--mint-dim)] font-medium text-[var(--mint)]"
                : "font-normal text-muted-foreground hover:bg-[var(--muted)] hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon
              className={cn("size-[17px] shrink-0", active ? "text-[var(--mint)]" : "")}
              strokeWidth={1.75}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
