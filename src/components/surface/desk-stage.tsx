import type { ReactNode } from "react";
import Link from "next/link";
import { CinematicImage } from "@/components/surface/cinematic-image";
import { cn } from "@/lib/utils";

export function DeskStage({
  kicker,
  title,
  lead,
  figure,
  photo = "/media/grain-kernel-macro.png",
  photoAlt = "",
  className,
}: {
  kicker?: string;
  title: ReactNode;
  lead?: ReactNode;
  figure?: ReactNode;
  photo?: string;
  photoAlt?: string;
  className?: string;
}) {
  return (
    <section className={cn("desk-stage relative block w-full min-h-[220px] overflow-hidden lg:min-h-[280px]", className)}>
      <CinematicImage
        src={photo}
        alt={photoAlt}
        kenBurns
        priority
        sizes="(min-width: 1024px) 75vw, 100vw"
        className="absolute inset-0"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-background/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-background/10" />
      <div className="relative flex min-h-[220px] flex-col justify-end px-5 py-8 sm:px-8 lg:min-h-[280px] lg:px-10">
        {kicker ? <p className="reveal label-caps text-harvest">{kicker}</p> : null}
        <h1 className="reveal reveal-delay-1 mt-3 max-w-3xl font-heading text-[clamp(1.75rem,4.2vw,3.15rem)] leading-[0.95] text-bone">
          {title}
        </h1>
        {lead ? (
          <p className="reveal reveal-delay-2 mt-4 max-w-xl text-sm leading-relaxed text-bone/80 sm:text-[0.95rem]">
            {lead}
          </p>
        ) : null}
        {figure ? <div className="reveal reveal-delay-3 mt-8">{figure}</div> : null}
      </div>
    </section>
  );
}

export function DeskFigure({
  label,
  value,
  meta,
}: {
  label: string;
  value: ReactNode;
  meta?: Array<{ label: string; value: ReactNode }>;
}) {
  return (
    <div>
      <p className="label-caps text-straw">{label}</p>
      <p className="mt-1 font-tabular text-5xl tracking-tight text-harvest sm:text-6xl">
        {value}
      </p>
      {meta && meta.length > 0 ? (
        <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 border-t border-harvest/25 pt-4">
          {meta.map((item) => (
            <div key={item.label}>
              <dt className="label-caps">{item.label}</dt>
              <dd className="mt-1 font-tabular text-lg text-bone">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export function DeskLedger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-harvest/15 border-y border-harvest/20", className)}>
      {children}
    </ul>
  );
}

export function DeskRow({
  href,
  index,
  kicker,
  title,
  value,
  hint,
  active = false,
}: {
  href?: string;
  index?: string;
  kicker?: string;
  title: ReactNode;
  value?: ReactNode;
  hint?: ReactNode;
  active?: boolean;
}) {
  const body = (
    <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 py-4 transition-colors duration-150 ease-out">
      <div className="min-w-0">
        {(index || kicker) ? (
          <p className="flex items-baseline gap-3">
            {index ? (
              <span className="font-tabular text-[10px] tracking-widest text-straw">{index}</span>
            ) : null}
            {kicker ? <span className="label-caps text-straw">{kicker}</span> : null}
          </p>
        ) : null}
        <p className={cn("mt-1 text-base", active ? "text-harvest" : "text-bone")}>{title}</p>
        {hint ? <p className="mt-1 max-w-2xl text-sm text-straw">{hint}</p> : null}
      </div>
      {value ? <div className="font-tabular text-xl text-harvest">{value}</div> : null}
    </div>
  );

  if (!href || active) {
    return <li aria-current={active ? "page" : undefined}>{body}</li>;
  }

  return (
    <li>
      <Link href={href} className="block hover:text-harvest">
        {body}
      </Link>
    </li>
  );
}

export function DeskSplit({
  compact,
  wide,
}: {
  compact: ReactNode;
  wide: ReactNode;
}) {
  return (
    <>
      <div className="xl:hidden">{compact}</div>
      <div className="hidden xl:block">{wide}</div>
    </>
  );
}

export function DeskBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <p className="mb-8">
      <Link
        href={href}
        className="text-sm text-straw transition-colors duration-150 ease-out hover:text-harvest"
      >
        {label}
      </Link>
    </p>
  );
}

export function DeskNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("max-w-2xl text-sm leading-relaxed text-straw", className)}>{children}</p>
  );
}

export function DeskToolbar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end gap-3 border-b border-harvest/15 pb-6">
      {children}
    </div>
  );
}

export function deskIndex(index: number): string {
  return String(index + 1).padStart(2, "0");
}
