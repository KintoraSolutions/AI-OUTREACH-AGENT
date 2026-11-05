import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { FG_2, FG_3, LINE, LINE_STRONG, R_SM, SURFACE } from "./theme";

/**
 * Navigation below 768px.
 *
 * There was none. Both nav links carried `hidden sm:inline`, so from 0 to
 * 639px the header was a wordmark and a button, and the three anchored
 * sections had no affordance at all.
 *
 * Built on a native `<details>` rather than React state or a Radix primitive,
 * for two reasons. The page must stay usable with JavaScript off, which is a
 * constraint the reveal animations already respect; and the only disclosure
 * primitives in `components/ui` are Radix dialog and dropdown-menu, both
 * light-themed, which would drag theme tokens into a deliberately dark-locked
 * subtree. `<details>` costs nothing and works everywhere.
 *
 * The breakpoint moves from 640 to 768 so the bar never has to carry four
 * text items plus a button in the awkward middle range.
 */
export function MobileNav({
  items,
}: {
  items: { label: string; href: string }[];
}) {
  return (
    <details className="group relative md:hidden">
      <summary
        className="flex h-9 cursor-pointer list-none items-center gap-1.5 px-2.5 text-[13px] [&::-webkit-details-marker]:hidden"
        style={{ border: `1px solid ${LINE_STRONG}`, borderRadius: R_SM, color: FG_2 }}
      >
        Menu
        <ChevronDown
          aria-hidden
          className="size-3.5 transition-transform group-open:rotate-180"
        />
      </summary>

      <div
        className="absolute right-0 top-[calc(100%+8px)] z-40 w-[232px] overflow-hidden"
        style={{
          background: SURFACE,
          border: `1px solid ${LINE_STRONG}`,
          borderRadius: R_SM,
          boxShadow: "0 24px 48px -16px rgba(0,0,0,0.9)",
        }}
      >
        {items.map((item, i) => (
          <a
            key={item.href}
            href={item.href}
            className="flex h-12 items-center px-4 text-[14px]"
            style={{ borderTop: i === 0 ? "none" : `1px solid ${LINE}`, color: FG_2 }}
          >
            {item.label}
          </a>
        ))}
        <div style={{ borderTop: `1px solid ${LINE}` }} className="p-3">
          <Link
            href="/signin"
            className="flex h-10 items-center justify-center text-[14px] font-semibold text-black"
            style={{ background: "#ffffff", borderRadius: R_SM }}
          >
            Sign in
          </Link>
          <p className="mt-2.5 text-center text-[11.5px]" style={{ color: FG_3 }}>
            Access is limited to approved accounts.
          </p>
        </div>
      </div>
    </details>
  );
}
