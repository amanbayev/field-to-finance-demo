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
        "flex flex-wrap gap-x-10 gap-y-6 border-y border-harvest/20 py-6",
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
    <div className={cn("min-w-[7rem]", className)}>
      <p className="label-caps">{label}</p>
      <div
        className={cn(
          "mt-1 font-tabular tracking-tight",
          emphasis === "primary" ? "text-3xl text-harvest" : "text-xl text-bone",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-straw">{hint}</div> : null}
    </div>
  );
}
