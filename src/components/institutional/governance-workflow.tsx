import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function GovernanceWorkflow({
  groups,
}: {
  groups: Array<{
    title: string;
    steps: Array<{
      id: string;
      label: string;
      complete: boolean;
      completeLabel: string;
      openLabel: string;
    }>;
  }>;
}) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.title}>
          <h3 className="mb-2 text-[11px] tracking-[0.08em] text-[#7B857F] uppercase">
            {group.title}
          </h3>
          <ol className="space-y-1.5">
            {group.steps.map((step) => (
              <li
                key={step.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-2.5 py-1.5"
              >
                <span className="text-sm">{step.label}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px]",
                    step.complete ? "text-[#0B5D3B]" : "text-muted-foreground",
                  )}
                >
                  {step.complete ? <Check className="size-3.5" aria-hidden /> : null}
                  {step.complete ? step.completeLabel : step.openLabel}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
