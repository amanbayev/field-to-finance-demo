import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-5 max-w-3xl", className)}>
      {eyebrow ? <p className="label-caps mb-1.5 text-primary">{eyebrow}</p> : null}
      <h1 className="font-heading text-2xl tracking-tight text-foreground sm:text-[1.75rem]">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
