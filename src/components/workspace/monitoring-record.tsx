import { getTranslations } from "next-intl/server";
import { DataList } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeskLedger, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { lookupMessage } from "@/i18n/t-dynamic";
import { formatScore } from "@/lib/format";
import type { ContractListItem } from "@/services/contract-service";
import { monitoringWarningKeys } from "@/services/workspace-view";

export function monitoringHref(contractId: string): string {
  return `/monitoring/${contractId}`;
}

export async function MonitoringPlotsLedger({
  items,
  activeId,
}: {
  items: ContractListItem[];
  activeId?: string;
}) {
  const tCatalog = await getTranslations("catalog");
  const tStatus = await getTranslations("status");

  return (
    <DeskLedger>
      {items.map((item, index) => {
        const warnings = monitoringWarningKeys(item.contract);
        return (
          <DeskRow
            key={item.contract.id}
            href={monitoringHref(item.contract.id)}
            active={item.contract.id === activeId}
            index={deskIndex(index)}
            kicker={lookupMessage(tCatalog, `regions.${item.contract.field.region}`)}
            title={item.contract.field.cadastralRef}
            value={lookupMessage(tStatus, item.contract.monitoring.satellite)}
            hint={
              warnings.length
                ? `${lookupMessage(tStatus, item.contract.monitoring.soilMoisture)} · ${lookupMessage(tStatus, item.contract.status)}`
                : lookupMessage(tStatus, item.contract.monitoring.soilMoisture)
            }
          />
        );
      })}
    </DeskLedger>
  );
}

export async function MonitoringDetailRecord({ item }: { item: ContractListItem }) {
  const t = await getTranslations("workspace");
  const { contract, producer } = item;
  const warnings = monitoringWarningKeys(contract);
  const warningLabels = warnings.map((key) => {
    if (key === "insurance") {
      return t("insuranceStatus");
    }
    if (key === "status") {
      return t("contractStatus");
    }
    return t(key);
  });

  return (
    <>
      <DataList
        items={[
          { label: t("cadastral"), value: contract.field.cadastralRef },
          {
            label: t("satellite"),
            value: <StatusBadge value={contract.monitoring.satellite} />,
          },
          {
            label: t("soilMoisture"),
            value: <StatusBadge value={contract.monitoring.soilMoisture} />,
          },
          {
            label: t("score"),
            value: formatScore(producer.score.value, producer.score.maxValue),
          },
          {
            label: t("insuranceStatus"),
            value: <StatusBadge value={contract.insurance.status} />,
          },
          {
            label: t("contractStatus"),
            value: <StatusBadge value={contract.status} />,
          },
          {
            label: t("latestAsOf"),
            value: producer.score.asOf,
          },
        ]}
      />
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-straw">
        {warnings.length === 0
          ? t("noAnomalies")
          : `${t("anomalies")}: ${warningLabels.join(" · ")}`}
      </p>
    </>
  );
}
