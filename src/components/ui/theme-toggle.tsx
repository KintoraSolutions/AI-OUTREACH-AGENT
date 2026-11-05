"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  DEFAULT_THEME,
  isTheme,
  resolvesToDark,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "Use system setting", Icon: Monitor },
];

function apply(theme: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", resolvesToDark(theme, prefersDark));
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle({ className }: { className?: string }) {
  // Start from the default rather than from localStorage: the boot script has
  // already painted the right theme, and reading storage during render would
  // make the server and client markup disagree.
  const [theme, setTheme] = React.useState<Theme>(DEFAULT_THEME);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) setTheme(stored);
    setMounted(true);
  }, []);

  // While on "system", follow the OS if the user changes it mid-session.
  React.useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  function choose(next: Theme) {
    setTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Private mode / blocked storage: the choice still applies this session.
    }
    apply(next);
  }

  const active = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2]!;
  // Before mount we cannot know the stored value, so show the neutral system
  // glyph rather than guessing and flickering.
  const TriggerIcon = mounted ? active.Icon : Monitor;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Theme: ${mounted ? active.label : "system"}. Change theme`}
        className={cn(
          "inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-[var(--fl-fg-2)] transition-colors hover:bg-[var(--muted)] hover:text-foreground",
          className,
        )}
      >
        <TriggerIcon className="size-[18px]" strokeWidth={1.75} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => choose(value)}
            className={cn(
              "gap-2.5",
              mounted && theme === value && "font-semibold text-[var(--fl-brand-text)]",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
