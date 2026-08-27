import { useTranslations } from "next-intl";
import Link from "next/link";
import { lifecycleSteps } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function LifecycleStrip({ className }: { className?: string }) {
  const t = useTranslations("lifecycle");

  return (
    <ol
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-3 border border-border bg-card px-4 py-4 text-sm",
        className,
      )}
    >
      {lifecycleSteps.map((step, index) => (
        <li key={step.id} className="flex items-center gap-1">
          {index > 0 ? (
            <span className="px-1 text-harvest/70" aria-hidden>
              →
            </span>
          ) : null}
          <Link
            href={step.href}
            className="text-bone transition-colors duration-150 ease-out hover:text-harvest"
          >
            <span className="mr-1.5 font-tabular text-[10px] text-harvest">
              {String(index + 1).padStart(2, "0")}
            </span>
            {t(step.id)}
          </Link>
        </li>
      ))}
    </ol>
  );
}
