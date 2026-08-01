"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Check, X, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { SubmitButton } from "@/components/app/submit-button";
import { EmptyState } from "@/components/app/empty-state";
import { initialFormState, type FormState } from "@/lib/actions/form";
import {
  cancelFollowUpAction,
  completeFollowUpAction,
  createFollowUpAction,
  syncFollowUpCalendarAction,
} from "@/app/(dashboard)/leads/followup-actions";
import type { BadgeTone } from "@/lib/leads/constants";

export interface FollowUpView {
  id: string;
  title: string | null;
  dueDate: string;
  note: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "PENDING" | "COMPLETED" | "CANCELLED";
  assigneeName: string | null;
  calendarStatus: string | null;
  overdue: boolean;
}

export interface FollowUpMember {
  id: string;
  name: string;
}

const PRIORITY_TONES: Record<FollowUpView["priority"], BadgeTone> = {
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};
const STATUS_TONES: Record<FollowUpView["status"], BadgeTone> = {
  PENDING: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

function formatDue(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FollowUpManager({
  clinicId,
  followUps,
  members,
  currentUserId,
  canEdit,
  calendarConnected,
}: {
  clinicId: string;
  followUps: FollowUpView[];
  members: FollowUpMember[];
  currentUserId: string;
  canEdit: boolean;
  calendarConnected: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, formAction] = useActionState<FormState, FormData>(
    createFollowUpAction.bind(null, clinicId),
    initialFormState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && state.message) {
      toast.success(state.message);
      formRef.current?.reset();
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  function run(fn: () => Promise<FormState>) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "Done.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Something went wrong.");
      }
    });
  }

  const err = state.fieldErrors ?? {};

  return (
    <div className="space-y-4">
      {followUps.length > 0 ? (
        <ul className="space-y-2">
          {followUps.map((f) => (
            <li key={f.id} className="rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{f.title || "Follow-up"}</span>
                <span className="text-muted-foreground">{formatDue(f.dueDate)}</span>
                {f.overdue ? (
                  <Badge tone="danger">Overdue</Badge>
                ) : (
                  <Badge tone={STATUS_TONES[f.status]}>{f.status.toLowerCase()}</Badge>
                )}
                <Badge tone={PRIORITY_TONES[f.priority]}>{f.priority.toLowerCase()} priority</Badge>
                {f.calendarStatus === "created" ? (
                  <Badge tone="info">On calendar</Badge>
                ) : f.calendarStatus === "cancelled" ? (
                  <Badge tone="neutral">Calendar cancelled</Badge>
                ) : null}
              </div>
              {f.note ? <p className="mt-1 text-muted-foreground">{f.note}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">
                Assigned to {f.assigneeName ?? "unassigned"}
              </p>
              {canEdit && f.status === "PENDING" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => completeFollowUpAction(f.id))}>
                    <Check className="mr-1 h-3.5 w-3.5" /> Complete
                  </Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => cancelFollowUpAction(f.id))}>
                    <X className="mr-1 h-3.5 w-3.5" /> Cancel
                  </Button>
                  {calendarConnected ? (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => syncFollowUpCalendarAction(f.id))}>
                      <CalendarPlus className="mr-1 h-3.5 w-3.5" />
                      {f.calendarStatus === "created" ? "Update calendar" : "Add to calendar"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={CalendarClock} title="No follow-ups" />
      )}

      {canEdit ? (
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">Schedule follow-up</summary>
          <form ref={formRef} action={formAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Title" htmlFor="fu-title" error={err.title} className="sm:col-span-2">
              <Input id="fu-title" name="title" placeholder="e.g. Call back about redesign" />
            </Field>
            <Field label="Due date & time" htmlFor="fu-due" required error={err.dueDate}>
              <Input id="fu-due" name="dueDate" type="datetime-local" required />
            </Field>
            <Field label="Priority" htmlFor="fu-priority" error={err.priority}>
              <Select id="fu-priority" name="priority" defaultValue="MEDIUM">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </Select>
            </Field>
            <Field label="Assignee" htmlFor="fu-assignee" error={err.assigneeId}>
              <Select id="fu-assignee" name="assigneeId" defaultValue={currentUserId}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === currentUserId ? " (you)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note" htmlFor="fu-note" error={err.note}>
              <Input id="fu-note" name="note" placeholder="Optional" />
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox name="addToCalendar" disabled={!calendarConnected} />
              Add to Google Calendar
              {!calendarConnected ? (
                <span className="text-xs text-muted-foreground">(connect Calendar in Settings)</span>
              ) : null}
            </label>
            <div className="sm:col-span-2">
              <SubmitButton size="sm" pendingText="Scheduling...">
                Schedule follow-up
              </SubmitButton>
            </div>
          </form>
        </details>
      ) : null}
    </div>
  );
}
