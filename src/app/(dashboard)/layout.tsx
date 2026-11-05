import { redirect } from "next/navigation";
import { requireOrgContext } from "@/lib/auth/rbac";
import { isOrgOnboarded } from "@/lib/ai/company-profile";
import { ROLE_LABELS } from "@/lib/leads/constants";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppHeader, BreadcrumbBar } from "@/components/app/app-header";
import { NavRail } from "@/components/app/nav-rail";

/**
 * Fluent suite shell: a 48px header (brand, global search, help, theme,
 * settings, account), a collapsible navigation rail, and a breadcrumb strip
 * above the page. The header used to hold nothing but a user chip.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireOrgContext();

  // First-run gate: route brand-new orgs through onboarding before the console.
  if (!(await isOrgOnboarded(ctx.orgId))) redirect("/onboarding");

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-screen flex-col bg-[var(--fl-bg-3)]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:border-[var(--fl-stroke-1)] focus:bg-[var(--fl-bg-1)] focus:px-3 focus:py-2 focus:text-body1 focus:font-semibold focus:shadow-16"
        >
          Skip to content
        </a>

        <AppHeader
          userName={ctx.userName}
          userEmail={ctx.userEmail}
          roleLabel={ROLE_LABELS[ctx.role]}
          activeOrgId={ctx.orgId}
          activeOrgName={ctx.orgName}
          memberships={ctx.memberships}
        />

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <NavRail />

          <div className="flex min-w-0 flex-1 flex-col">
            <BreadcrumbBar />
            <main
              id="main-content"
              className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6"
            >
              {children}
            </main>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
