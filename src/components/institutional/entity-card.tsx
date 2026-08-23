import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EntityCard({
  title,
  description,
  action,
  children,
  footer,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-lg border border-border bg-card",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium tracking-tight text-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </header>
      <div className="min-w-0 flex-1 px-4 py-3">{children}</div>
      {footer ? (
        <footer className="border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
