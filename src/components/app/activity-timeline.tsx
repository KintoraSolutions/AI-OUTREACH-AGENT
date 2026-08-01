import { ActivityType } from "@prisma/client";
import { ACTIVITY_LABELS } from "@/lib/leads/constants";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/app/empty-state";
import { History } from "lucide-react";

export interface ActivityItem {
  id: string;
  type: ActivityType;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState icon={History} title="No activity yet" description="Actions on this lead will appear here." />
    );
  }
  return (
    <ol className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3">
          <div className="mt-1.5 size-2 shrink-0 rounded-full bg-border" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="text-sm font-medium">{ACTIVITY_LABELS[item.type]}</span>
              <time className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</time>
            </div>
            {item.note ? <p className="mt-0.5 text-sm text-muted-foreground">{item.note}</p> : null}
            {item.actorName ? (
              <p className="mt-0.5 text-xs text-muted-foreground">by {item.actorName}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
