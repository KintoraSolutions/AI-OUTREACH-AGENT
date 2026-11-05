"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/app/sidebar-nav";

/**
 * Mobile navigation disclosure. Below `md` the rail is hidden; this hamburger
 * toggles a Fluent flyout of the same nav. Closes on route change, on Escape,
 * and on click-away, and is keyboard operable.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={open ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <X strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Menu strokeWidth={1.75} aria-hidden="true" />
        )}
      </Button>
      {open ? (
        <>
          {/* Click-away overlay. */}
          <div className="fixed inset-0 z-30" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            id="mobile-nav-panel"
            className="absolute left-0 top-full z-40 mt-1 w-64 rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] shadow-16 animate-in fade-in-0 slide-in-from-top-2 duration-150 ease-[var(--ease-decelerate)]"
          >
            <nav aria-label="Primary">
              <SidebarNav onNavigate={() => setOpen(false)} />
            </nav>
          </div>
        </>
      ) : null}
    </div>
  );
}
