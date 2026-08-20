import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const positive = new Set([
  "VERIFIED",
  "PASSED",
  "CONFIRMED",
  "IN_POOL",
  "HEALTHY",
  "ACTIVE",
  "ELIGIBLE",
  "APPROVED",
  "LOW_RISK",
  "CLEAR",
  "CONNECTED",
  "NORMAL",
]);

const caution = new Set([
  "PENDING",
  "PENDING_VERIFICATION",
  "WATCH",
  "DRAFT",
  "COMING_NEXT",
  "EXPERIMENTAL",
  "NOT_YET_DEPLOYED",
  "DRY",
  "EXPIRED",
  "NOT_APPLICABLE",
  "MOCK",
  "NONE",
]);

const negative = new Set([
  "SUSPENDED",
  "FAILED",
  "ALERT",
  "BREACH",
  "BLOCKED",
  "HIGH_RISK",
  "HIT",
  "INELIGIBLE",
  "EXCESS",
]);

function markerClass(value: string): string {
  if (positive.has(value)) {
    return "bg-primary";
  }
  if (negative.has(value)) {
    return "bg-destructive";
  }
  if (caution.has(value)) {
    return "bg-muted-foreground/55";
  }
  return "bg-muted-foreground/40";
}

function textClass(value: string): string {
  if (negative.has(value)) {
    return "text-destructive";
  }
  return "text-foreground";
}

export function StatusBadge({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const t = useTranslations("status");
  const label = t(value as Parameters<typeof t>[0]);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 text-xs font-medium tracking-wide",
        textClass(value),
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", markerClass(value))}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
