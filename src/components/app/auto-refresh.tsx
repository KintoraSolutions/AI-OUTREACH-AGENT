"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refreshes the current server-rendered route on an interval while a job is
 * active, so research progress and counts update live without a manual reload.
 * The database is the source of truth; this just re-fetches it. When `active`
 * is false the poller is idle (no wasted requests once jobs are terminal).
 *
 * The poll also pauses while the tab is hidden and does one immediate refresh
 * when it becomes visible again — a backgrounded tab costs zero server queries.
 */
export function AutoRefresh({ active, intervalMs = 4000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;

    let id: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      if (id === undefined) id = setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (id !== undefined) {
        clearInterval(id);
        id = undefined;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        router.refresh(); // catch up immediately on return, then resume polling
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, intervalMs, router]);
  return null;
}
