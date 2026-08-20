import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatHectares, formatScore, formatTonnes } from "@/lib/format";
import type { ContractListItem } from "@/services/contract-service";

export function ContractSummaryCard({ item }: { item: ContractListItem }) {
  const { contract, producer } = item;

  return (
    <Link href={`/contracts/${contract.id}`} className="block h-full">
      <Card className="h-full shadow-none transition-colors hover:border-primary/40">
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs text-muted-foreground">
                {contract.id}
              </p>
              <CardTitle className="mt-1">{producer.legalName}</CardTitle>
            </div>
            <StatusBadge value={contract.status} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Crop" value={contract.production.crop} />
          <Field label="Season" value={String(contract.production.season)} />
          <Field label="Field" value={formatHectares(contract.field.areaHectares)} />
          <Field
            label="Expected production"
            value={formatTonnes(contract.production.expectedProductionTonnes)}
          />
          <Field label="Quality" value={contract.production.quality} />
          <Field label="Region" value={contract.field.region} />
          <Field
            label="Producer score"
            value={formatScore(producer.score.value, producer.score.maxValue)}
          />
          <Field label="Delivery" value={contract.production.deliveryPeriod} />
        </CardContent>
      </Card>
    </Link>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}
