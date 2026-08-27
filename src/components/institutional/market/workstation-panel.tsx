import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkstationPanel({
  title,
  action,
  children,
  className,
  bodyClassName,
  padded = true,
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card", className)}>
      <header className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="text-[12px] font-medium tracking-tight">{title}</h2>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("min-h-0 flex-1", padded && "p-3", bodyClassName)}>{children}</div>
    </section>
  );
}
