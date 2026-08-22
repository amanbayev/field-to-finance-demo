import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { LifecycleStrip } from "@/components/dashboard/lifecycle-strip";
import { DualMoney } from "@/components/shared/dual-money";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { getDashboardSnapshot } from "@/services/dashboard-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

export default async function DashboardPage() {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const { metrics, network } = await getDashboardSnapshot();

  return (
    <div>
      <PageHeader
        eyebrow={t("dashboard.eyebrow")}
        title={t("dashboard.title")}
        description={t("dashboard.intro")}
      />

      <MetricStrip className="mb-px">
        <MetricCell
          emphasis="primary"
          label={t("dashboard.eligibleCoverage")}
          value={t("units.tonnes", {
            value: formatInteger(metrics.eligibleCoverageTonnes, locale),
          })}
        />
        <MetricCell
          emphasis="primary"
          label={t("dashboard.tokenIssuance")}
          value={
            metrics.tokenIssuanceStarted
              ? t("units.tonnes", {
                  value: formatInteger(metrics.tokenizedVolumeTonnes, locale),
                })
              : t("dashboard.tokenIssuanceNotStarted")
          }
        />
        <MetricCell
          emphasis="primary"
          label={t("dashboard.activeFinancing")}
          value={<DualMoney value={metrics.activeFinancing} />}
        />
      </MetricStrip>
      <MetricStrip className="sm:grid-cols-4">
        <MetricCell
          label={t("dashboard.wheatMinted")}
          value={formatInteger(metrics.wheatMintedSupply, locale)}
        />
        <MetricCell
          label={t("dashboard.primaryPlacement")}
          value={formatInteger(metrics.primaryPlacementVolume, locale)}
        />
        <MetricCell
          label={t("dashboard.registrarInventory")}
          value={formatInteger(metrics.registrarInventory, locale)}
        />
        <MetricCell
          label={t("dashboard.circulating")}
          value={formatInteger(metrics.circulatingSupply, locale)}
        />
      </MetricStrip>
      <MetricStrip className="sm:grid-cols-4">
        <MetricCell
          label={t("dashboard.verifiedOnChain")}
          value={formatInteger(metrics.verifiedOnChainContracts, locale)}
        />
        <MetricCell
          label={t("dashboard.contractPool")}
          value={formatInteger(metrics.contractPools, locale)}
        />
        <MetricCell
          label={t("dashboard.grossPoolVolume")}
          value={t("units.tonnes", {
            value: formatInteger(metrics.grossPoolVolumeTonnes, locale),
          })}
        />
        <MetricCell
          label={t("dashboard.digitalContracts")}
          value={formatInteger(metrics.digitalContracts, locale)}
        />
      </MetricStrip>

      <PageSection
        title={t("lifecycle.title")}
        description={t("lifecycle.description")}
      >
        <LifecycleStrip />
      </PageSection>

      <PageSection
        title={t("dashboard.infrastructure")}
        description={t("dashboard.infrastructureNote")}
      >
        <MetricStrip className="sm:grid-cols-4">
          <MetricCell
            label={network.network}
            value={
              network.connected
                ? t("header.connected")
                : t("header.disconnected")
            }
          />
          <MetricCell
            label={t("dashboard.registryProgram")}
            value={
              network.registryProgramDeployed
                ? t("status.DEPLOYED")
                : t("status.NOT_YET_DEPLOYED")
            }
          />
          <MetricCell
            label={t("dashboard.marketProgram")}
            value={
              network.marketProgramDeployed
                ? t("status.DEPLOYED")
                : t("status.NOT_YET_DEPLOYED")
            }
          />
          <MetricCell
            label={t("dashboard.onChainDemoContracts")}
            value={formatInteger(network.onChainDemoContracts, locale)}
          />
        </MetricStrip>
      </PageSection>
    </div>
  );
}
