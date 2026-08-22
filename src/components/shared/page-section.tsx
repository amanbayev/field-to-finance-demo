import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-8", className)}>
      <div className="mb-3 flex items-end justify-between gap-4 border-b border-border pb-2">
        <div className="min-w-0">
          <h2 className="text-sm font-medium tracking-wide text-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
