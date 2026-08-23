import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-[#B9C3BC] bg-[#F1F4F1] px-4 py-5 text-sm text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
