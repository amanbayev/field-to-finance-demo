import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FactStrip({
  items,
  className,
}: {
  items: { label: string; value: ReactNode }[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="bg-card px-3 py-2.5">
          <dt className="label-caps">{item.label}</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
