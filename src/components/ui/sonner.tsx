"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "group border border-border bg-popover text-popover-foreground rounded-md shadow-md",
          description: "text-muted-foreground",
        },
      }}
    />
  );
}
