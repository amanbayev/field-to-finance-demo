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
    <div className={cn("rounded-md border border-border bg-card px-4 py-3.5", className)}>
      <div className="flex items-center gap-2">
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <p className="text-[10px] tracking-[0.08em] text-[#7B857F] uppercase">{label}</p>
      </div>
      <p className="mt-2.5 text-[1.25rem] leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
