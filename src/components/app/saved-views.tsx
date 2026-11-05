"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Bookmark, Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { saveViewAction, deleteViewAction } from "@/app/(dashboard)/leads/view-actions";
import { cn } from "@/lib/utils";

export interface SavedViewItem {
  id: string;
  name: string;
  params: string;
}

/** Current lead-table filters as a query string, excluding pagination. */
function currentParamsString(params: URLSearchParams): string {
  const sp = new URLSearchParams(params.toString());
  sp.delete("page");
  return sp.toString();
}

/**
 * Saved views, as a single command-bar control.
 *
 * This used to be a full-width row of pills sitting between the filter bar and
 * the table — one of four stacked bars that pushed the first lead below the
 * fold. Collapsed into a menu it keeps the active view visible in the trigger
 * label while costing one button of height, and Radix supplies the focus trap,
 * Escape handling and `aria-modal` the hand-rolled popovers never had.
 */
export function SavedViews({ views }: { views: SavedViewItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const current = currentParamsString(params);
  const activeView = views.find((v) => v.params === current);
  const activeLabel = activeView?.name ?? "All leads";

  function save() {
    const value = name.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await saveViewAction(value, current);
      if (res.ok) {
        toast.success(res.message ?? "Saved.");
        setName("");
        setAdding(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not save view.");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteViewAction(id);
      if (res.ok) {
        toast.success(res.message ?? "Deleted.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not delete view.");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-9 max-w-[16rem] gap-1.5">
          <Bookmark className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-normal text-[var(--fl-fg-3)]">View</span>
          <span className="truncate">{activeLabel}</span>
          <ChevronDown className="size-4 shrink-0 text-[var(--fl-fg-3)]" aria-hidden="true" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" aria-label="Saved views" className="w-[min(92vw,17rem)] p-0">
        <div className="border-b border-[var(--hairline)] px-3 py-2.5">
          <p className="text-body1 font-semibold text-[var(--fl-fg-1)]">Saved views</p>
          <p className="mt-0.5 text-caption1 text-[var(--fl-fg-2)]">
            A view stores the filters and sort you have applied right now.
          </p>
        </div>

        <ul className="max-h-64 overflow-y-auto p-1.5">
          <li>
            <ViewLink href={pathname} label="All leads" active={current === ""} />
          </li>
          {views.map((v) => (
            <li key={v.id} className="flex items-center gap-1">
              <ViewLink
                href={`${pathname}?${v.params}`}
                label={v.name}
                active={activeView?.id === v.id}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Delete saved view ${v.name}`}
                disabled={pending}
                onClick={() => remove(v.id)}
                className="shrink-0 text-[var(--fl-fg-3)] hover:text-[var(--fl-danger-fg)]"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
          {views.length === 0 ? (
            <li className="px-2 py-1.5 text-caption1 text-[var(--fl-fg-3)]">
              You have not saved a view yet.
            </li>
          ) : null}
        </ul>

        <div className="border-t border-[var(--hairline)] p-1.5">
          {adding ? (
            <div className="flex items-center gap-1.5 p-1">
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    save();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    setAdding(false);
                    setName("");
                  }
                }}
                placeholder="View name"
                aria-label="Name for this saved view"
                className="h-8 flex-1 text-body1"
              />
              <Button size="sm" disabled={pending || !name.trim()} onClick={save}>
                Save
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Save current filters as a view
            </Button>
          )}
          {pending ? (
            <div className="px-2 pb-1 pt-1.5">
              <Spinner size="xs" label="Updating saved views" showLabel />
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ViewLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <PopoverClose asChild>
      <Link
        href={href}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-body1 text-[var(--fl-fg-1)] transition-colors duration-100 ease-[var(--ease-easy)] hover:bg-[var(--fl-subtle-hover)]",
          active && "bg-[var(--fl-brand-tint)] font-semibold",
        )}
      >
        <Check
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-[var(--fl-brand-text)]",
            !active && "invisible",
          )}
        />
        <span className="truncate">{label}</span>
      </Link>
    </PopoverClose>
  );
}
