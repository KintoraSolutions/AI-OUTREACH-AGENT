"use client";

import { useTransition } from "react";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
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
}

export function OrgSwitcher({ activeOrgId, activeOrgName, memberships }: OrgSwitcherProps) {
  const [pending, startTransition] = useTransition();

  function select(orgId: string) {
    if (orgId === activeOrgId) return;
    startTransition(() => {
      void switchOrg(orgId);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center justify-between gap-2 rounded-[7px] border px-2.5 py-1.5 text-[13px] hover:bg-muted disabled:opacity-60"
        disabled={pending || memberships.length <= 1}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Building2 className="size-[15px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
          <span className="truncate font-medium">{activeOrgName}</span>
        </span>
        {memberships.length > 1 ? (
          <ChevronsUpDown className="size-[15px] shrink-0 text-muted-foreground" />
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memberships.map((m) => (
          <DropdownMenuItem key={m.orgId} onSelect={() => select(m.orgId)}>
            <span className="flex-1 truncate">{m.orgName}</span>
            <span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</span>
            <Check className={cn("size-4", m.orgId === activeOrgId ? "opacity-100" : "opacity-0")} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
