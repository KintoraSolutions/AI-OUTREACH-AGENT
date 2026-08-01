"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Mail, Calendar, Link2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
      <p className="text-sm text-muted-foreground">
        Gmail and Calendar are unavailable until{" "}
        <code className="text-xs">GOOGLE_CLIENT_ID</code>,{" "}
        <code className="text-xs">GOOGLE_CLIENT_SECRET</code>, and{" "}
        <code className="text-xs">TOKEN_ENCRYPTION_KEY</code> are configured. Drafts can still be
        copied manually.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {myConnection && !myConnection.revoked ? (
        <div className="rounded-md border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
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
                  <span className="text-xs text-muted-foreground">No Gmail/Calendar scopes granted.</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Connected {new Date(myConnection.connectedAt).toLocaleDateString()}. Tokens are
                encrypted at rest and never shown.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={disconnect} disabled={pending}>
              Disconnect
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!myConnection.capabilities.includes("gmail") && (
              <Button asChild size="sm" variant="outline">
                <Link href="/api/integrations/google/connect?capability=gmail" prefetch={false}>
                  <Mail className="mr-1.5 h-4 w-4" /> Add Gmail drafts
                </Link>
              </Button>
            )}
            {!myConnection.capabilities.includes("calendar") && (
              <Button asChild size="sm" variant="outline">
                <Link href="/api/integrations/google/connect?capability=calendar" prefetch={false}>
                  <Calendar className="mr-1.5 h-4 w-4" /> Add Calendar
                </Link>
              </Button>
            )}
            {canManageDefault && !myConnection.isDefaultSender && (
              <Button size="sm" variant="ghost" onClick={() => makeDefault(myConnection.id)} disabled={pending}>
                Make org default sender
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect your Google account to create Gmail drafts from approved emails and sync
            follow-ups to Calendar. You grant only the scopes you choose; nothing is ever sent
            automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href="/api/integrations/google/connect?capability=gmail,calendar" prefetch={false}>
                <Link2 className="mr-1.5 h-4 w-4" /> Connect Google
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/api/integrations/google/connect?capability=gmail" prefetch={false}>
                <Mail className="mr-1.5 h-4 w-4" /> Gmail only
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/api/integrations/google/connect?capability=calendar" prefetch={false}>
                <Calendar className="mr-1.5 h-4 w-4" /> Calendar only
              </Link>
            </Button>
          </div>
        </div>
      )}

      {canManageDefault && orgConnections.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Organization connections
          </h3>
          <ul className="divide-y rounded-md border text-sm">
            {orgConnections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="flex items-center gap-2">
                  {c.accountEmail ?? "Google account"}
                  {c.isMine && <Badge tone="neutral">You</Badge>}
                  {c.isDefaultSender && <Badge tone="success">Default sender</Badge>}
                  {c.revoked && <Badge tone="danger">Disconnected</Badge>}
                  {c.capabilities.map((cap) => (
                    <span key={cap} className="text-xs text-muted-foreground">
                      {CAP_LABEL[cap] ?? cap}
                    </span>
                  ))}
                </span>
                {!c.isDefaultSender && !c.revoked && (
                  <Button size="sm" variant="ghost" onClick={() => makeDefault(c.id)} disabled={pending}>
                    Set as default sender
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            The default sender lets teammates without their own connection create Gmail drafts from
            this account.
          </p>
        </div>
      )}
    </div>
  );
}
