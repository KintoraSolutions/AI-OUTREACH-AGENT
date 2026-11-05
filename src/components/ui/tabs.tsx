"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * Fluent TabList. The selected tab is marked by a brand underline that spans
 * the label, matching Fluent 2 rather than the pill/segmented style.
 */

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex items-center gap-1 overflow-x-auto border-b border-[var(--hairline)]",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "relative shrink-0 cursor-pointer whitespace-nowrap rounded-t-md px-3 py-2.5 text-body1 font-medium text-[var(--fl-fg-2)] transition-colors",
      "hover:bg-[var(--muted)] hover:text-foreground",
      "data-[state=active]:font-semibold data-[state=active]:text-[var(--fl-brand-text)]",
      // The underline is an ::after on the trigger so it tracks the label width.
      "after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-full after:bg-transparent data-[state=active]:after:bg-[var(--fl-brand-text)]",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn("mt-5 outline-none", className)} {...props} />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
