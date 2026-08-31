import { MarketStatusChip } from "@/components/market-core/market-status-chip";

const STEPS = [
  "matched",
  "eligibilityRecheck",
  "sellerReservation",
  "buyerReservation",
  "dvp",
  "registryUpdate",
  "finalSettlement",
] as const;

export function TradeLifecycle({
  labels,
  pendingLabel,
  confirmedLabel,
  eligibilityPassed,
}: {
  labels: Record<(typeof STEPS)[number], string>;
  pendingLabel: string;
  confirmedLabel: string;
  eligibilityPassed: boolean;
}) {
  return (
    <ol className="grid gap-2">
      {STEPS.map((step) => {
        const done =
          step === "matched" ||
          step === "sellerReservation" ||
          step === "buyerReservation" ||
          (step === "eligibilityRecheck" && eligibilityPassed);
        return (
          <li key={step} className="flex items-center justify-between gap-3 text-sm">
            <span>{labels[step]}</span>
            <MarketStatusChip
              label={done ? confirmedLabel : pendingLabel}
              tone={done ? "ISSUED" : "AWAITING"}
            />
          </li>
        );
      })}
    </ol>
  );
}
