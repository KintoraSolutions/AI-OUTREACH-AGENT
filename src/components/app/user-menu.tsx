"use client";

import Link from "next/link";
import { HelpCircle, LogOut, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/lib/auth/actions";
import { initials } from "@/lib/format";

interface UserMenuProps {
  name: string | null;
  email: string;
  role: string;
  orgName?: string;
}

/**
 * Account menu. The avatar is a brand-tinted coin: the old neutral circle sat
 * on a white Fluent header and effectively disappeared.
 */
export function UserMenu({ name, email, role, orgName }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account menu for ${name ?? email}`}
        className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-[var(--fl-brand-tint)] text-caption1 font-semibold text-[var(--fl-brand-text)] transition-colors hover:bg-[var(--fl-brand-tint-hover)]"
      >
        <span aria-hidden="true">{initials(name, email)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        <DropdownMenuLabel>
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-body1 font-semibold text-[var(--fl-fg-1)]">
              {name ?? email}
            </span>
            <span className="truncate text-caption1 font-normal text-[var(--fl-fg-3)]">
              {email}
            </span>
            <span className="mt-1 text-caption1 font-normal text-[var(--fl-fg-2)]">
              {orgName ? `${orgName} · ${role}` : role}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/help">
            <HelpCircle className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Help
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOutAction()}>
          <LogOut className="size-4" strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
