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
  "ON_CHAIN",
  "VERIFIED_ON_CHAIN",
  "PROTECTED_ON_CHAIN",
  "ATTESTED",
  "LOCKED",
  "MATCHED",
  "ACCEPTED",
  "EXECUTED",
  "REGISTRAR_ACCEPTED",
  "MINTED",
  "SETTLED",
  "ATOMIC_DVP",
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
  "OFF_CHAIN",
  "PROOF_UNAVAILABLE",
  "CLOSED",
  "PENDING_ATTESTATION",
  "OPEN",
  "WITHDRAWN",
  "PREPARED",
  "CANCELLED",
  "SIMULATION_ONLY",
  "DEMO_SIMULATED",
  "UPLOADED",
  "REPLACEMENT_REQUESTED",
  "SUPERSEDED",
  "SUBMITTED",
  "UNDER_REVIEW",
  "PENDING_PRODUCER_CONFIRMATION",
  "PENDING_ISSUER_CONFIRMATION",
  "READY_FOR_REGISTRAR",
  "UNDER_REGISTRAR_REVIEW",
  "RETURNED_BY_REGISTRAR",
  "CHANGES_REQUESTED",
  "RESUBMITTED",
  "ARCHIVED",
  "NEW",
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
  "REJECTED",
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
