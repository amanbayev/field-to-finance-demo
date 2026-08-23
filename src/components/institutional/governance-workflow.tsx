import { cn } from "@/lib/utils";
import { StatusChip } from "@/components/institutional/status-chip";

export function GovernanceWorkflow({
  groups,
}: {
  groups: Array<{
    title: string;
    steps: Array<{ id: string; label: string; complete: boolean; completeLabel: string; openLabel: string }>;
  }>;
}) {
  return (
    <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {groups.map((group, index) => (
        <li key={group.title} className="min-w-0">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-medium tracking-[0.08em] text-[#7B857F] uppercase">
            <span className="font-mono text-[10px] text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            {group.title}
          </p>
          <ul className="space-y-1.5">
            {group.steps.map((step) => (
              <li
                key={step.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5",
                  step.complete ? "bg-card" : "bg-[#F7F8F5]",
                )}
              >
                <span className="text-[12px] text-foreground">{step.label}</span>
                <StatusChip
                  family="lifecycle"
                  code={step.complete ? "ADMITTED" : "STRUCTURING"}
                  label={step.complete ? step.completeLabel : step.openLabel}
                />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}
