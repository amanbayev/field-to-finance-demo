import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MetricStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MetricCell({
  label,
  value,
  hint,
  emphasis = "secondary",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  emphasis?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <div className={cn("bg-card px-4 py-3", className)}>
      <p className="label-caps">{label}</p>
      <div
        className={cn(
          "mt-1.5 font-tabular tracking-tight text-foreground",
          emphasis === "primary" ? "text-2xl font-medium" : "text-base font-medium",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
