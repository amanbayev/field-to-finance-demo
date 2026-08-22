import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  ACTIVE: "bg-primary",
  ADMITTED: "bg-primary",
  ISSUED: "bg-primary",
  ELIGIBLE: "bg-primary",
  STRUCTURING: "bg-muted-foreground/55",
  CONCEPT: "bg-muted-foreground/40",
  IN_REVIEW: "bg-muted-foreground/55",
  FUTURE: "bg-muted-foreground/40",
  NOT_ASSESSED: "bg-muted-foreground/40",
  POLICY_PENDING: "bg-muted-foreground/55",
  CLOSED: "bg-muted-foreground/55",
  PRIMARY_ONLY: "bg-muted-foreground/55",
  NOT_OPEN: "bg-muted-foreground/40",
};

export function MarketStatusChip({
  label,
  tone = "STRUCTURING",
}: {
  label: string;
  tone?: string;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 text-xs font-medium tracking-wide">
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full", TONE[tone] ?? TONE.STRUCTURING)}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
