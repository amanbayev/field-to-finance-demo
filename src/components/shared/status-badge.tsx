import { Badge } from "@/components/ui/badge";
import { formatStatusLabel } from "@/lib/format";
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

export function StatusBadge({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const tone = positive.has(value)
    ? "border-primary/20 bg-accent text-accent-foreground"
    : negative.has(value)
      ? "border-destructive/20 bg-destructive/10 text-destructive"
      : caution.has(value)
        ? "border-border bg-secondary text-secondary-foreground"
        : "border-border bg-muted text-muted-foreground";

  return (
    <Badge
      variant="outline"
      className={cn("rounded-sm font-medium tracking-wide uppercase", tone, className)}
    >
      {formatStatusLabel(value)}
    </Badge>
  );
}
