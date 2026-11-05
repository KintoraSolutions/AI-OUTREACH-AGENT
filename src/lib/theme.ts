/**
 * Theme plumbing shared by the boot script and the toggle.
 *
 * Deliberately dependency-free: the only hard requirement is that the `dark`
 * class lands on <html> BEFORE first paint, which a 300-byte inline script
 * does as well as any library and without a runtime bundle.
 */

export const THEME_STORAGE_KEY = "oa-theme";

export const THEME_VALUES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEME_VALUES)[number];

export const DEFAULT_THEME: Theme = "system";

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEME_VALUES as readonly string[]).includes(value);
}

/** Does this preference resolve to the dark palette right now? */
export function resolvesToDark(theme: Theme, prefersDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && prefersDark);
}

/**
 * Runs in <head> before paint, so the page never flashes the wrong theme.
 * Kept as a string (not a component) so it can be inlined verbatim and stays
 * trivially auditable. Any failure falls through to the light default rather
 * than blocking render.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=="light"&&t!=="dark"&&t!=="system"){t=${JSON.stringify(DEFAULT_THEME)};}var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.dataset.theme=t;}catch(e){}})();`;
