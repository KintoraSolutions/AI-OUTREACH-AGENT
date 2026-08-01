"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isPermission = error.message?.toLowerCase().includes("permission");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">
          {isPermission ? "You don't have permission" : "Something went wrong"}
        </p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {isPermission
            ? "Your role does not allow this action. Contact an organization admin."
            : "An unexpected error occurred. Verify your configuration (database and environment) and try again."}
        </p>
      </div>
      {!isPermission ? (
        <Button size="sm" onClick={reset}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
