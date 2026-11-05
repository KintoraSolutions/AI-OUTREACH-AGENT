/**
 * Landing palette and layout scale.
 *
 * These are the signed-in app's *dark* Fluent values, lifted verbatim, so the
 * marketing page and the product are visibly the same piece of software.
 *
 * The landing is deliberately dark-locked: it does not follow the app's theme
 * toggle, so it cannot read `--fl-*` from the document (a visitor whose OS is
 * light would get light-theme tokens painted on a black page — which is exactly
 * why the brand mark used to disappear up in the nav). `SCOPE` below re-declares
 * the handful of Fluent variables that shared components such as `KatalystMark`
 * consume, pinned to their dark values, for the landing subtree only.
 */

/** Canvas, deepest. Slightly below the app's #1f1f1f for marketing contrast. */
export const INK = "#0a0a0b";
/** Panel ground, e.g. the product window body. */
export const SURFACE = "#151516";
/** Raised card inside a panel — the app's --fl-bg-1 equivalent. */
export const SURFACE_2 = "#1d1d1f";
/** Highest: hovered rows, chips. */
export const SURFACE_3 = "#242426";

export const LINE = "rgba(255,255,255,0.085)";
export const LINE_STRONG = "rgba(255,255,255,0.16)";

/** Accent text / data. Matches the app's --fl-brand-text in dark. */
export const BRAND = "#479ef5";
/** Solid fill that carries white text. The app's --fl-brand in dark. */
export const BRAND_FILL = "#115ea3";
export const BRAND_TINT = "#0a2e4a";

export const OK = "#54b054";
export const WARN = "#f2c661";
export const DANGER = "#f1707b";

/** Text ramp, mirroring --fl-fg-1..3 in dark. */
export const FG_1 = "#ffffff";
export const FG_2 = "#d6d6d6";
export const FG_3 = "#adadad";
export const FG_4 = "#8a8a8a";

/**
 * Corner radii. The product is built on a 2/4/6px Fluent ramp, so the landing
 * uses the same ramp and nothing on the page exceeds 6px except status dots.
 */
export const R_SM = "2px";
export const R_MD = "4px";
export const R_LG = "6px";

/** Fluent variables re-pinned to dark for the landing subtree. */
export const SCOPE: React.CSSProperties = {
  ["--fl-fg-1" as string]: FG_1,
  ["--fl-fg-2" as string]: FG_2,
  ["--fl-fg-3" as string]: FG_3,
  ["--fl-brand-text" as string]: BRAND,
  ["--fl-brand" as string]: BRAND_FILL,
  // Dark values, or :focus-visible paints a black ring on a black page.
  ["--fl-focus-outer" as string]: "#ffffff",
  ["--fl-focus-inner" as string]: "#000000",
};

/** Hairline border shorthand used across the marketing components. */
export const hair = (color: string = LINE) => ({ border: `1px solid ${color}` });

/* ------------------------------------------------------------------------ */
/* Structure                                                                 */
/* ------------------------------------------------------------------------ */

/**
 * Ground planes carry section identity.
 *
 * The previous page took all of its structure from two devices: a hairline
 * frame drawn down both sides of the container, and an uppercase mono kicker
 * above every heading. Both were asked to go. The failure mode that invites
 * them back is real — when every section shares one ground, one width and one
 * opening, the page collapses into an undifferentiated column, and a drawn
 * rule is the cheapest way to pretend otherwise.
 *
 * So structure now comes from what kind of thing a section *is*:
 *
 *   `narrative`     an argument made in words, ground INK
 *   `demonstration` a product surface is the subject, ground SURFACE
 *   `statement`     one short centred claim, ground SURFACE_2, used once
 *
 * Adjacent planes must never share a ground. A full-bleed ground change is a
 * stronger boundary than a 1px rule at any viewport, and unlike a hairline it
 * survives at 375px, where `rgba(255,255,255,0.085)` is effectively invisible.
 */
export type PlaneKind = "narrative" | "demonstration" | "statement";

export const PLANE_GROUND: Record<PlaneKind, string> = {
  narrative: INK,
  demonstration: SURFACE,
  statement: SURFACE_2,
};

/** Content column. The frame is gone; the measure is what aligns the page. */
export const CONTAINER = "mx-auto w-full max-w-[1140px] px-5 sm:px-8 lg:px-12";

/**
 * Section rhythm. The void above a heading is the delimiter that replaced the
 * border, so it has to be large enough to read as one: 80 / 112 / 144px.
 * Padding never varies by section — a section that needs more presence gets a
 * different ground, not more space. That rule is what keeps the rhythm legible.
 */
export const SECTION_PAD = "py-20 sm:py-28 lg:py-36";
