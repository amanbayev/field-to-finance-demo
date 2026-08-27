import type { ReactNode } from "react";
import { CinematicImage } from "@/components/surface/cinematic-image";
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
    <section className={cn("mt-10", className)}>
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-harvest/20 pb-3">
        <div className="min-w-0">
          <h2 className="label-caps text-harvest">{title}</h2>
          {description ? (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-straw">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  kicker,
  title,
  body,
  action,
  children,
}: {
  kicker?: string;
  title?: string;
  body?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="relative min-h-[240px] overflow-hidden">
      <CinematicImage
        src="/media/empty-silo-light.png"
        alt=""
        className="absolute inset-0"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/78 to-background/30" />
      <div className="relative flex min-h-[240px] flex-col justify-end px-6 py-10 sm:px-8">
        {kicker ? <p className="label-caps text-harvest">{kicker}</p> : null}
        {title ? (
          <h3 className="mt-2 max-w-lg font-heading text-2xl leading-tight text-bone sm:text-3xl">
            {title}
          </h3>
        ) : null}
        {body ? <p className="mt-3 max-w-lg text-sm leading-relaxed text-straw">{body}</p> : null}
        {action ? <div className="mt-6">{action}</div> : null}
        {!title && !body ? (
          <div className="max-w-lg text-sm leading-relaxed text-bone">{children}</div>
        ) : null}
      </div>
    </div>
  );
}
