import * as React from "react";
import { CommandBar } from "@/components/app/command-bar";
import { CrumbTitle } from "@/components/app/app-header";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

/**
 * Page title block. The signature is unchanged — ~10 pages call this as
 * `<PageHeader title description actions />` — but the actions now render as a
 * Fluent command bar under the title instead of floating beside it, and the
 * title is published to the breadcrumb trail so a detail page reads
 * "Leads > Riverside Dental".
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <CrumbTitle label={title} />
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-title3 font-semibold text-[var(--fl-fg-1)]">{title}</h1>
        {description ? (
          <p className="text-body1 text-[var(--fl-fg-2)]">{description}</p>
        ) : null}
      </div>
      {actions ? <CommandBar>{actions}</CommandBar> : null}
    </div>
  );
}
