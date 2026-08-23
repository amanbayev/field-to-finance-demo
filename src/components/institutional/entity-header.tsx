import type { ReactNode } from "react";

export function EntityHeader({
  breadcrumbs,
  eyebrow,
  title,
  description,
  badges,
  context,
  actions,
}: {
  breadcrumbs: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  badges?: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-5">
      {breadcrumbs}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-medium tracking-[0.1em] text-[#7B857F] uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-mono text-[1.75rem] leading-none font-medium tracking-tight text-foreground">
            {title}
          </h1>
          {badges ? <div className="mt-2.5 flex flex-wrap items-center gap-2">{badges}</div> : null}
          {context ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {context}
            </div>
          ) : null}
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
    </header>
  );
}
