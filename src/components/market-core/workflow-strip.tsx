import { cn } from "@/lib/utils";
import { deskIndex } from "@/components/surface/desk-stage";

export function WorkflowStrip({
  steps,
  className,
}: {
  steps: readonly string[];
  className?: string;
}) {
  return (
    <ol className={cn("divide-y divide-harvest/15 border-y border-harvest/20", className)}>
      {steps.map((step, index) => (
        <li key={`${step}-${index}`} className="flex items-baseline gap-3 py-3">
          <span className="font-tabular text-[10px] tracking-widest text-harvest">
            {deskIndex(index)}
          </span>
          <span className="text-sm text-bone">{step}</span>
        </li>
      ))}
    </ol>
  );
}
