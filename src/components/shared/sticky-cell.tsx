import type { ReactNode } from "react";
import { TableCell, TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const stickyClass =
  "sticky left-0 z-10 bg-background shadow-[1px_0_0_0_color-mix(in_srgb,var(--harvest)_28%,transparent)] group-hover:bg-muted/40";

export function StickyHead({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <TableHead className={cn(stickyClass, className)}>{children}</TableHead>;
}

export function StickyCell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <TableCell className={cn(stickyClass, "whitespace-nowrap", className)}>
      {children}
    </TableCell>
  );
}
