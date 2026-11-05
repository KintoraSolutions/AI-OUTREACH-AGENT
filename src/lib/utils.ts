import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The Fluent type ramp, as declared in `globals.css` under `@theme`.
 *
 * tailwind-merge ships a hardcoded list of Tailwind's OWN font sizes (`text-xs`
 * … `text-9xl`). It has no way to know about custom `--text-*` theme keys, so
 * an unrecognized `text-<word>` falls into its `text-color` class group.
 *
 * That was a live bug: `buttonVariants` sets `text-[var(--fl-on-brand)]` in the
 * variant and `text-caption1` in `size="sm"`. tailwind-merge saw two "text
 * colors", kept the last, and threw the real color away — so every small solid
 * button rendered dark ink on brand blue at 2.88:1, failing WCAG AA.
 *
 * Declaring the ramp here fixes it for every call site at once, rather than
 * asking each one to defend itself with an explicit color override.
 */
const FLUENT_FONT_SIZES = [
  "caption2",
  "caption1",
  "body1",
  "body2",
  "subtitle2",
  "subtitle1",
  "title3",
  "title2",
  "title1",
  "large-title",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...FLUENT_FONT_SIZES] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
