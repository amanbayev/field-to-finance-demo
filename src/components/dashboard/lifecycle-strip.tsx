import { useTranslations } from "next-intl";
import Link from "next/link";
import { lifecycleSteps } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function LifecycleStrip({ className }: { className?: string }) {
  const t = useTranslations("lifecycle");

  return (
    <ol
      className={cn(
        "flex flex-wrap items-center gap-x-1 gap-y-2 border border-border bg-card px-3 py-2.5 text-sm",
        className,
      )}
    >
      {lifecycleSteps.map((step, index) => (
        <li key={step.id} className="flex items-center gap-1">
          {index > 0 ? (
            <span className="px-1 text-muted-foreground" aria-hidden>
              →
            </span>
          ) : null}
          <Link
            href={step.href}
            className="text-muted-foreground hover:text-foreground"
          >
            <span className="mr-1.5 font-tabular text-[10px] text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            {t(step.id)}
          </Link>
        </li>
      ))}
    </ol>
  );
}
