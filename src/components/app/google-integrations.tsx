"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Mail, Calendar, Link2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  disconnectGoogleAction,
  setDefaultSenderAction,
} from "@/app/(dashboard)/settings/integration-actions";
import type { PublicGoogleConnection } from "@/lib/integrations/google-connections";

const CAP_LABEL: Record<string, string> = { gmail: "Gmail drafts", calendar: "Calendar events" };

export function GoogleIntegrations({
  configured,
  myConnection,
  orgConnections,
  canManageDefault,
}: {
  configured: boolean;
  myConnection: PublicGoogleConnection | null;
  orgConnections: PublicGoogleConnection[];
  canManageDefault: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function disconnect() {
    startTransition(async () => {
      const res = await disconnectGoogleAction();
      if (res.ok) toast.success(res.message ?? "Disconnected.");
      else toast.error(res.error ?? "Could not disconnect.");
    });
  }

  function makeDefault(connectionId: string) {
    startTransition(async () => {
      const res = await setDefaultSenderAction(connectionId);
      if (res.ok) toast.success(res.message ?? "Default sender updated.");
      else toast.error(res.error ?? "Could not update.");
    });
  }

  if (!configured) {
    return (
      <p className="text-body1 leading-relaxed text-[var(--fl-fg-2)]">
        Gmail and Calendar are unavailable until{" "}
        <code className="font-mono text-caption1">GOOGLE_CLIENT_ID</code>,{" "}
        <code className="font-mono text-caption1">GOOGLE_CLIENT_SECRET</code>, and{" "}
        <code className="font-mono text-caption1">TOKEN_ENCRYPTION_KEY</code> are configured. Drafts
        can still be copied manually.
      </p>
    );
  }

  return (
    <div className="space-y-5" aria-busy={pending}>
      {pending ? (
        <Spinner size="sm" label="Updating Google connection" showLabel />
      ) : null}

      {myConnection && !myConnection.revoked ? (
        <div className="rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)] p-4 shadow-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2 text-body1 font-semibold text-[var(--fl-fg-1)]">
                <ShieldCheck
                  aria-hidden="true"
                  className="size-4 shrink-0 text-[var(--fl-success-fg)]"
                />
                {myConnection.accountEmail ?? "Connected Google account"}
                {myConnection.isDefaultSender && <Badge tone="success">Default sender</Badge>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {myConnection.capabilities.length > 0 ? (
                  myConnection.capabilities.map((c) => (
                    <Badge key={c} tone="info">
                      {CAP_LABEL[c] ?? c}
                    </Badge>
                  ))
                ) : (
                  <span className="text-caption1 text-[var(--fl-fg-3)]">
                    No Gmail or Calendar scopes granted.
                  </span>
                )}
              </div>
              <p className="text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
                Connected {new Date(myConnection.connectedAt).toLocaleDateString()}. Tokens are
                encrypted at rest and never shown.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={disconnect}
              disabled={pending}
              aria-label={`Disconnect ${myConnection.accountEmail ?? "this Google account"}`}
            >
              Disconnect
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--fl-stroke-2)] pt-4">
            {!myConnection.capabilities.includes("gmail") && (
              <Button asChild size="sm" variant="outline">
                <Link href="/api/integrations/google/connect?capability=gmail" prefetch={false}>
                  <Mail aria-hidden="true" /> Add Gmail drafts
                </Link>
              </Button>
            )}
            {!myConnection.capabilities.includes("calendar") && (
              <Button asChild size="sm" variant="outline">
                <Link href="/api/integrations/google/connect?capability=calendar" prefetch={false}>
                  <Calendar aria-hidden="true" /> Add Calendar
                </Link>
              </Button>
            )}
            {canManageDefault && !myConnection.isDefaultSender && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => makeDefault(myConnection.id)}
                disabled={pending}
              >
                Make org default sender
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-body1 leading-relaxed text-[var(--fl-fg-2)]">
            Connect your Google account to create Gmail drafts from approved emails and sync
            follow-ups to Calendar. You grant only the scopes you choose; nothing is ever sent
            automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link
                href="/api/integrations/google/connect?capability=gmail,calendar"
                prefetch={false}
              >
                <Link2 aria-hidden="true" /> Connect Google
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/api/integrations/google/connect?capability=gmail" prefetch={false}>
                <Mail aria-hidden="true" /> Gmail only
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/api/integrations/google/connect?capability=calendar" prefetch={false}>
                <Calendar aria-hidden="true" /> Calendar only
              </Link>
            </Button>
          </div>
        </div>
      )}

      {canManageDefault && orgConnections.length > 0 && (
        <section className="space-y-2" aria-labelledby="org-connections-heading">
          <h3
            id="org-connections-heading"
            className="text-caption1 font-semibold text-[var(--fl-fg-3)]"
          >
            Organization connections
          </h3>
          <ul className="divide-y divide-[var(--fl-stroke-2)] overflow-hidden rounded-md border border-[var(--fl-stroke-2)] bg-[var(--fl-bg-1)]">
            {orgConnections.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2.5"
              >
                <span className="flex flex-wrap items-center gap-2 text-body1 text-[var(--fl-fg-1)]">
                  {c.accountEmail ?? "Google account"}
                  {c.isMine && <Badge tone="neutral">You</Badge>}
                  {c.isDefaultSender && <Badge tone="success">Default sender</Badge>}
                  {c.revoked && <Badge tone="danger">Disconnected</Badge>}
                  {c.capabilities.map((cap) => (
                    <span key={cap} className="text-caption1 text-[var(--fl-fg-3)]">
                      {CAP_LABEL[cap] ?? cap}
                    </span>
                  ))}
                </span>
                {!c.isDefaultSender && !c.revoked && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => makeDefault(c.id)}
                    disabled={pending}
                    aria-label={`Set ${c.accountEmail ?? "this account"} as the default sender`}
                  >
                    Set as default sender
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-caption1 leading-relaxed text-[var(--fl-fg-3)]">
            The default sender lets teammates without their own connection create Gmail drafts from
            this account.
          </p>
        </section>
      )}
    </div>
  );
}
