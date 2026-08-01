"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Bookmark, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveViewAction, deleteViewAction } from "@/app/(dashboard)/leads/view-actions";

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

export function SavedViews({ views }: { views: SavedViewItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const current = currentParamsString(params);
  const activeView = views.find((v) => v.params === current);

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
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Bookmark className="size-3.5" />
        Views
      </span>

      <Link
        href={pathname}
        className={`rounded-full border px-3 py-1 text-xs transition-colors hover:bg-muted ${
          current === "" ? "border-primary bg-secondary font-medium" : ""
        }`}
      >
        All leads
      </Link>

      {views.map((v) => (
        <span
          key={v.id}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
            activeView?.id === v.id ? "border-primary bg-secondary font-medium" : ""
          }`}
        >
          <Link href={`${pathname}?${v.params}`} className="hover:underline">
            {v.name}
          </Link>
          <button
            type="button"
            aria-label={`Delete view ${v.name}`}
            className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            disabled={pending}
            onClick={() => remove(v.id)}
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}

      {adding ? (
        <span className="inline-flex items-center gap-1">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                setAdding(false);
                setName("");
              }
            }}
            placeholder="View name"
            aria-label="Saved view name"
            className="h-8 w-40 text-xs"
          />
          <Button size="sm" className="h-8" disabled={pending || !name.trim()} onClick={save}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            disabled={pending}
            onClick={() => {
              setAdding(false);
              setName("");
            }}
          >
            Cancel
          </Button>
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-xs"
          onClick={() => setAdding(true)}
          title="Save the current filters as a view"
        >
          <Plus className="size-3.5" />
          Save view
        </Button>
      )}
    </div>
  );
}
