import type { Metadata } from "next";
import { notFound, forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { DeskBackLink, DeskFigure } from "@/components/surface/desk-stage";
import {
  MonitoringDetailRecord,
  MonitoringPlotsLedger,
} from "@/components/workspace/monitoring-record";
import { lookupMessage } from "@/i18n/t-dynamic";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";
import { getContractForActor, listContractsForActor } from "@/services/access-service";
import { listContractIds } from "@/services/contract-service";
import { monitoringWarningKeys } from "@/services/workspace-view";

export const dynamicParams = false;

export function generateStaticParams() {
  return listContractIds().map((contractId) => ({ contractId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ contractId: string }>;
}): Promise<Metadata> {
  const actor = await requireOwnProducerWorkspace();
  const { contractId } = await params;
  const item = getContractForActor(actor, contractId);
  if (!item || item === "forbidden") {
    const t = await getTranslations("workspace");
    return { title: t("monitoringTitle") };
  }
  return { title: item.contract.field.cadastralRef };
}

export default async function MonitoringDetailPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const actor = await requireOwnProducerWorkspace();
  const { contractId } = await params;
  const item = getContractForActor(actor, contractId);

  if (item === "forbidden") {
    forbidden();
  }
  if (!item) {
    notFound();
  }

  const t = await getTranslations("workspace");
  const tDesk = await getTranslations("desk");
  const tStatus = await getTranslations("status");
  const plots = listContractsForActor(actor);
  const warnings = monitoringWarningKeys(item.contract);

  return (
    <div>
      <PageHeader
        eyebrow={t("monitoringEyebrow")}
        title={item.contract.field.cadastralRef}
        description={t("monitoringIntro")}
        photo="/media/grain-kernel-macro.png"
        figure={
          <DeskFigure
            label={t("satellite")}
            value={lookupMessage(tStatus, item.contract.monitoring.satellite)}
            meta={[
              {
                label: t("soilMoisture"),
                value: lookupMessage(tStatus, item.contract.monitoring.soilMoisture),
              },
              {
                label: t("anomalies"),
                value: String(warnings.length),
              },
            ]}
          />
        }
      />
      <DeskBackLink href="/monitoring" label={tDesk("backToMonitoring")} />
      <MonitoringDetailRecord item={item} />
      {plots.length > 1 ? (
        <PageSection title={tDesk("plots")}>
          <MonitoringPlotsLedger items={plots} activeId={item.contract.id} />
        </PageSection>
      ) : null}
    </div>
  );
}
