import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EntityCard({
  title,
  description,
  action,
  footer,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-md border border-border bg-card", className)}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-6 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium tracking-tight">{title}</h2>
          {description ? (
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="px-6 py-4">{children}</div>
      {footer ? (
        <footer className="border-t border-border px-6 py-2.5 text-[12px] text-muted-foreground">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
