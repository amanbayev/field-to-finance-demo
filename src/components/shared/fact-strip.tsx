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
        "grid grid-cols-2 gap-x-8 gap-y-5 border-y border-harvest/20 py-5 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="label-caps">{item.label}</dt>
          <dd className="mt-1 text-sm font-medium text-bone">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
