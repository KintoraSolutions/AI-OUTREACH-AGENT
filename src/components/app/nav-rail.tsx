"use client";

import * as React from "react";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { cn } from "@/lib/utils";

/**
 * The desktop navigation aside, plus the collapse state it shares with the
 * suite header's toggle.
 *
 * The state lives in a module-level store rather than in React context so the
 * header (which owns the toggle) and the rail (which owns the width) can both
 * read it without the server layout having to become a client component to
 * wrap them in a provider.
 */

const STORAGE_KEY = "oa-nav-collapsed";

let collapsed = false;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return collapsed;
}

/**
 * SSR always renders the expanded rail. The stored preference is applied in an
 * effect after mount, so server and client markup agree on the first paint.
 */
function getServerSnapshot() {
  return false;
}

export function setNavCollapsed(next: boolean) {
  if (collapsed === next) return;
  collapsed = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Private mode / blocked storage: the choice still applies this session.
  }
  emit();
}

export function toggleNavCollapsed() {
  setNavCollapsed(!collapsed);
}

export function useNavCollapsed(): boolean {
  const value = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  React.useEffect(() => {
    // Guarded at module scope: several components call this hook, but the
    // stored preference only needs to be read once per page load.
    if (hydrated) return;
    hydrated = true;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") {
        collapsed = true;
        emit();
      }
    } catch {
      // Unreadable storage just means the default, expanded rail.
    }
  }, []);

  return value;
}

export function NavRail({ className }: { className?: string }) {
  const isCollapsed = useNavCollapsed();

  return (
    <aside
      className={cn(
        "hidden shrink-0 border-r border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] md:sticky md:top-12 md:block md:h-[calc(100vh-3rem)] md:overflow-y-auto md:overflow-x-hidden",
        "transition-[width] duration-200 ease-[var(--ease-decelerate)] motion-reduce:transition-none",
        isCollapsed ? "md:w-12" : "md:w-60",
        className,
      )}
    >
      <nav id="app-nav" aria-label="Primary">
        <SidebarNav collapsed={isCollapsed} />
      </nav>
    </aside>
  );
}
