import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { requireOrgContext } from "@/lib/auth/rbac";
import { ROLE_LABELS } from "@/lib/leads/constants";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { MobileNav } from "@/components/app/mobile-nav";
import { OrgSwitcher } from "@/components/app/org-switcher";
import { UserMenu } from "@/components/app/user-menu";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireOrgContext();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <aside className="flex flex-col border-b md:h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <ShieldCheck className="size-4" />
          </div>
          <Link href="/dashboard" className="text-sm font-semibold">
            Outreach Agent
          </Link>
        </div>
        <div className="px-3 py-3">
          <OrgSwitcher
            activeOrgId={ctx.orgId}
            activeOrgName={ctx.orgName}
            memberships={ctx.memberships}
          />
        </div>
        <nav aria-label="Primary" className="hidden md:block">
          <SidebarNav />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b px-4 py-3 md:px-6">
          <MobileNav />
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:inline">
              {ROLE_LABELS[ctx.role]}
            </span>
            <UserMenu name={ctx.userName} email={ctx.userEmail} role={ROLE_LABELS[ctx.role]} />
          </div>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
