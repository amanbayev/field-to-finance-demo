import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  hint,
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-lg border border-border bg-card px-4 py-3",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#EAF4EE] text-[#0B5D3B]">
          {icon}
        </div>
      ) : null}
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-[0.08em] text-[#7B857F] uppercase">
          {label}
        </p>
        <div className="mt-1 text-sm font-medium tracking-tight text-foreground tabular-nums">
          {value}
        </div>
        {hint ? (
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{hint}</div>
        ) : null}
      </div>
    </div>
  );
}
