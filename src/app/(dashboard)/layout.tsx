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
      <aside className="glass-nav flex flex-col border-b border-[var(--hairline)] md:sticky md:top-0 md:h-screen md:w-[228px] md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 border-b border-[var(--hairline)] px-4 py-3.5">
          <ShieldCheck className="size-5 shrink-0 text-foreground" strokeWidth={1.75} />
          <Link href="/dashboard" className="text-[15px] font-semibold tracking-[-0.01em]">
            Outreach Agent
          </Link>
        </div>
        <div className="px-3 py-2.5">
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
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-[var(--hairline)] bg-[var(--background)] px-4 py-2.5 md:px-[30px]">
          <MobileNav />
          <div className="ml-auto flex items-center gap-2.5">
            <UserMenu name={ctx.userName} email={ctx.userEmail} role={ROLE_LABELS[ctx.role]} />
            <div className="hidden leading-tight sm:block">
              <p className="text-[11px] text-muted-foreground">{ROLE_LABELS[ctx.role]}</p>
              <p className="max-w-[140px] truncate text-[13px] font-medium text-foreground">
                {ctx.userName ?? ctx.userEmail}
              </p>
            </div>
          </div>
        </header>
        <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 md:px-[30px]">
          {children}
        </main>
      </div>
    </div>
  );
}
