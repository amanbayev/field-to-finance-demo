import type { ReactNode } from "react";

export function EntityHeader({
  breadcrumbs,
  eyebrow,
  title,
  description,
  badges,
  context,
  actions,
  compact = false,
}: {
  breadcrumbs: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  badges?: ReactNode;
  context?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header className={compact ? "mb-3" : "mb-5"}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">{breadcrumbs}</div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      <div className={compact ? "mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5" : "mt-3 flex flex-wrap items-center gap-x-3 gap-y-2"}>
        <h1
          className={
            compact
              ? "text-[1.375rem] leading-none font-semibold tracking-tight text-foreground"
              : "text-[1.75rem] leading-none font-semibold tracking-tight text-foreground"
          }
        >
          {title}
        </h1>
        {badges ? <div className="flex flex-wrap items-center gap-1.5">{badges}</div> : null}
      </div>
      {eyebrow || context ? (
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          {eyebrow}
          {eyebrow && context ? <span className="mx-2 text-[#B9C3BC]">·</span> : null}
          {context}
        </p>
      ) : null}
      {description ? (
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </header>
  );
}
