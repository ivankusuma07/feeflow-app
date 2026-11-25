"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as React from "react";
import { cn } from "./cn";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn("inline-flex rounded-full border border-line bg-surface p-[3px]", className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "min-h-[38px] cursor-pointer rounded-full border border-transparent px-4 text-sm text-muted",
        "data-[state=active]:border-ink data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-black",
        className,
      )}
      {...props}
    />
  );
}
