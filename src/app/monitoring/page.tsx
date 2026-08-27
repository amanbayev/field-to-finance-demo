import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure } from "@/components/surface/desk-stage";
import { MonitoringPlotsLedger } from "@/components/workspace/monitoring-record";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { requireOwnProducerWorkspace } from "@/lib/auth/guard";
import { listContractsForActor } from "@/services/access-service";
import { monitoringWarningKeys } from "@/services/workspace-view";

export async function generateMetadata(): Promise<Metadata> {
  await requireOwnProducerWorkspace();
  const t = await getTranslations("workspace");
  return { title: t("monitoringTitle") };
}

export default async function ProducerMonitoringPage() {
  const actor = await requireOwnProducerWorkspace();
  const t = await getTranslations("workspace");
  const tDesk = await getTranslations("desk");
  const locale = (await getLocale()) as AppLocale;
  const items = listContractsForActor(actor);
  const onWatch = items.filter(
    (item) => monitoringWarningKeys(item.contract).length > 0,
  ).length;

  return (
    <div>
      <PageHeader
        eyebrow={t("monitoringEyebrow")}
        title={t("monitoringTitle")}
        description={t("monitoringIntro")}
        photo="/media/grain-kernel-macro.png"
        figure={
          items.length ? (
            <DeskFigure
              label={tDesk("plots")}
              value={formatInteger(items.length, locale)}
              meta={[
                {
                  label: tDesk("onWatch"),
                  value: formatInteger(onWatch, locale),
                },
                {
                  label: tDesk("clearPlots"),
                  value: formatInteger(items.length - onWatch, locale),
                },
              ]}
            />
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState
          kicker={t("monitoringEyebrow")}
          title={tDesk("noMonitoringTitle")}
          body={tDesk("noMonitoringBody")}
        />
      ) : (
        <MonitoringPlotsLedger items={items} />
      )}
    </div>
  );
}
