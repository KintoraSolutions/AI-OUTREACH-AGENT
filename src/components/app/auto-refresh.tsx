"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refreshes the current server-rendered route on an interval while a job is
 * active, so research progress and counts update live without a manual reload.
 * The database is the source of truth; this just re-fetches it. When `active`
 * is false the poller is idle (no wasted requests once jobs are terminal).
 */
export function AutoRefresh({ active, intervalMs = 4000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
