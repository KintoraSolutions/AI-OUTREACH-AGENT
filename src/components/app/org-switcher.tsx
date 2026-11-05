"use client";

import { useTransition } from "react";
import { Building2, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS } from "@/lib/leads/constants";
import { switchOrg } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import type { Role } from "@prisma/client";

interface OrgSwitcherProps {
  activeOrgId: string;
  activeOrgName: string;
  memberships: { orgId: string; orgName: string; role: Role }[];
  className?: string;
}

/**
 * Organization picker. Renders nothing for the common single-org case: a
 * permanently disabled dropdown reads as broken chrome, and the active org is
 * already named in the user menu.
 */
export function OrgSwitcher({
  activeOrgId,
  activeOrgName,
  memberships,
  className,
}: OrgSwitcherProps) {
  const [pending, startTransition] = useTransition();

  if (memberships.length <= 1) return null;

  function select(orgId: string) {
    if (orgId === activeOrgId) return;
    startTransition(() => {
      void switchOrg(orgId);
    });
  }

  return (
    <div className={cn("items-center", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-8 max-w-56 cursor-pointer items-center gap-2 rounded-md px-2 text-body1 text-[var(--fl-fg-2)] transition-colors hover:bg-[var(--fl-subtle-hover)] hover:text-[var(--fl-fg-1)] disabled:cursor-default disabled:opacity-60"
          disabled={pending}
          aria-busy={pending}
          aria-label={`Organization: ${activeOrgName}. Switch organization`}
        >
          <Building2 className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="truncate font-semibold">{activeOrgName}</span>
          <ChevronDown className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {memberships.map((m) => {
            const active = m.orgId === activeOrgId;
            return (
              <DropdownMenuItem key={m.orgId} onSelect={() => select(m.orgId)}>
                <Check
                  className={cn("size-4 shrink-0", active ? "opacity-100" : "opacity-0")}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{m.orgName}</span>
                <span className="text-caption1 text-[var(--fl-fg-3)]">{ROLE_LABELS[m.role]}</span>
                {active ? <span className="sr-only">(current organization)</span> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* The switch is a server action + redirect; announce it while it runs. */}
      <span aria-live="polite" className="sr-only">
        {pending ? "Switching organization" : ""}
      </span>
    </div>
  );
}
