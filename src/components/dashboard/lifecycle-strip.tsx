import Link from "next/link";
import { lifecycleSteps } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function LifecycleStrip({ className }: { className?: string }) {
  return (
    <ol
      className={cn(
        "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {lifecycleSteps.map((step, index) => (
        <li key={step.id}>
          <Link
            href={step.href}
            className="flex h-full flex-col justify-between rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent"
          >
            <span className="font-mono text-[11px] text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="mt-3 font-heading text-lg leading-none">
              {step.label}
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
