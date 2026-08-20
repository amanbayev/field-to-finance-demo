import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatScore } from "@/lib/format";
import type { ContractListItem } from "@/services/contract-service";

export function ContractSummaryCard({ item }: { item: ContractListItem }) {
  const { contract, producer } = item;
  const t = useTranslations("contracts");
  const tUnits = useTranslations("units");
  const tCatalog = useTranslations("catalog");
  const locale = useLocale() as AppLocale;

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
          <Field
            label={t("fields.crop")}
            value={lookupMessage(tCatalog, `crops.${contract.production.crop}`)}
          />
          <Field
            label={t("fields.season")}
            value={String(contract.production.season)}
          />
          <Field
            label={t("fields.field")}
            value={tUnits("hectares", {
              value: formatInteger(contract.field.areaHectares, locale),
            })}
          />
          <Field
            label={t("fields.expectedProduction")}
            value={tUnits("tonnes", {
              value: formatInteger(
                contract.production.expectedProductionTonnes,
                locale,
              ),
            })}
          />
          <Field
            label={t("fields.quality")}
            value={lookupMessage(tCatalog, `quality.${contract.production.quality}`)}
          />
          <Field
            label={t("fields.region")}
            value={lookupMessage(tCatalog, `regions.${contract.field.region}`)}
          />
          <Field
            label={t("producerScore")}
            value={formatScore(producer.score.value, producer.score.maxValue)}
          />
          <Field
            label={t("fields.delivery")}
            value={lookupMessage(tCatalog, `delivery.${contract.production.deliveryPeriod}`)}
          />
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
