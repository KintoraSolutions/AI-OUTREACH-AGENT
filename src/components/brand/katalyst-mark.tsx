/**
 * Katalyst brand mark: an angular "K" whose upper arm becomes an up-right arrow
 * (growth / outreach), rendered in a metallic silver gradient.
 *
 * `gradientId` must be unique when the mark appears more than once on a page
 * (duplicate SVG gradient ids are invalid markup).
 */
export function KatalystMark({
  size = 30,
  gradientId = "katalyst-k",
  className,
}: {
  size?: number;
  gradientId?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 36 36"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        {/* Theme-aware metallic ramp. The stops were fixed light silvers
            (#edeeec -> #70716b), which vanished against a light surface once
            the app gained a light theme. */}
        <linearGradient id={gradientId} x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--fl-fg-1)" />
          <stop offset="0.55" stopColor="var(--fl-fg-2)" />
          <stop offset="1" stopColor="var(--fl-fg-3)" />
        </linearGradient>
      </defs>
      <g stroke={`url(#${gradientId})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 6.5V29.5" />
        <path d="M12 19 L25.5 29.5" />
        <path d="M12 18 L27.5 8" />
        <path d="M21.5 8 L27.5 8 L27.5 14" />
      </g>
    </svg>
  );
}
