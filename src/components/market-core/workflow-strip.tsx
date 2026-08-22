import { cn } from "@/lib/utils";

export function WorkflowStrip({
  steps,
  className,
}: {
  steps: readonly string[];
  className?: string;
}) {
  return (
    <ol
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-2 text-xs tracking-wide text-muted-foreground",
        className,
      )}
    >
      {steps.map((step, index) => (
        <li key={`${step}-${index}`} className="flex items-center gap-2">
          {index > 0 ? <span aria-hidden>→</span> : null}
          <span className="rounded-sm border border-border bg-card px-2 py-1 text-foreground">
            {step}
          </span>
        </li>
      ))}
    </ol>
  );
}
