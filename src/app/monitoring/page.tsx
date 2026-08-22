import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DataList } from "@/components/shared/data-list";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatScore } from "@/lib/format";
import { requirePermission } from "@/lib/auth/guard";
import { listContractsForActor } from "@/services/access-service";
import { monitoringWarningKeys } from "@/services/workspace-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("monitoringTitle") };
}

export default async function ProducerMonitoringPage() {
  const actor = await requirePermission("contracts.read.own");
  const t = await getTranslations("workspace");
  const items = listContractsForActor(actor);

  return (
    <div>
      <PageHeader
        eyebrow={t("monitoringEyebrow")}
        title={t("monitoringTitle")}
        description={t("monitoringIntro")}
      />
      {items.length === 0 ? (
        <EmptyState>{t("monitoringEmpty")}</EmptyState>
      ) : null}
      {items.map(({ contract, producer }) => {
        const warnings = monitoringWarningKeys(contract);
        return (
          <PageSection
            key={contract.id}
            title={
              <Link
                href={`/contracts/${contract.id}`}
                className="text-primary hover:underline"
              >
                {contract.id}
              </Link>
            }
          >
            <DataList
              items={[
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
            <p className="mt-3 text-sm text-muted-foreground">
              {warnings.length === 0
                ? t("noAnomalies")
                : `${t("anomalies")}: ${warnings.join(", ")}`}
            </p>
          </PageSection>
        );
      })}
    </div>
  );
}
