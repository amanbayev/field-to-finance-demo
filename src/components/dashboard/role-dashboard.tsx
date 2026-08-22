import { getLocale, getTranslations } from "next-intl/server";
import type { ActorContext } from "@/domain/identity";
import { listContractsForActor } from "@/services/access-service";
import { getDashboardSnapshot } from "@/services/dashboard-service";
import { getInvestorPortfolio } from "@/services/portfolio-service";
import { loadAdminOverview } from "@/services/admin-service";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { remainingCoverageCapacity } from "@/services/workspace-view";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageHeader } from "@/components/shared/page-header";
import { formatInteger } from "@/lib/format";
import type { AppLocale } from "@/i18n/config";

export async function RoleDashboard({ actor }: { actor: ActorContext }) {
  const role = actor.effective.roleId;
  if (role === "SYSTEM_ADMIN" && !actor.isImpersonating) {
    return <AdminHome />;
  }
  if (role === "REGULATOR") {
    return <RegulatorHome />;
  }
  if (role === "SCAS_OPERATOR") {
    return <ScasHome actor={actor} />;
  }
  if (role === "ISSUER_OPERATOR") {
    return <IssuerHome />;
  }
  if (role === "REGISTRAR_OPERATOR") {
    return <RegistrarHome />;
  }
  if (role === "PRODUCER_ADMIN") {
    return <ProducerHome actor={actor} />;
  }
  if (role === "INVESTOR") {
    return <InvestorHome actor={actor} />;
  }
  if (role === "TRADER") {
    return <TraderHome />;
  }
  if (role === "COMPLIANCE_OFFICER") {
    return <ComplianceHome />;
  }
  return <AdminHome />;
}

async function AdminHome() {
  const t = await getTranslations();
  const overview = await loadAdminOverview();
  return (
    <div>
      <PageHeader
        eyebrow={t("admin.eyebrow")}
        title={t("nav.dashboard")}
        description={t("admin.dashboardIntro")}
      />
      <MetricStrip className="sm:grid-cols-4">
        <MetricCell label={t("admin.users")} value={String(overview?.users ?? "—")} />
        <MetricCell
          label={t("admin.organizations")}
          value={String(overview?.organizations ?? "—")}
        />
        <MetricCell
          label={t("admin.memberships")}
          value={String(overview?.memberships ?? "—")}
        />
        <MetricCell
          label={t("admin.pendingRequests")}
          value={String(overview?.pendingRequests ?? "—")}
        />
      </MetricStrip>
    </div>
  );
}

async function RegulatorHome() {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const { metrics } = await getDashboardSnapshot();
  return (
    <div>
      <PageHeader
        eyebrow={t("nav.regulator")}
        title={t("nav.dashboard")}
        description={t("dashboard.regulatorIntro")}
      />
      <MetricStrip>
        <MetricCell
          emphasis="primary"
          label={t("dashboard.eligibleCoverage")}
          value={t("units.tonnes", {
            value: formatInteger(metrics.eligibleCoverageTonnes, locale),
          })}
        />
        <MetricCell
          label={t("dashboard.wheatMinted")}
          value={formatInteger(metrics.wheatMintedSupply, locale)}
        />
        <MetricCell
          label={t("dashboard.primaryPlacement")}
          value={formatInteger(metrics.primaryPlacementVolume, locale)}
        />
      </MetricStrip>
    </div>
  );
}

async function IssuerHome() {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const { metrics } = await getDashboardSnapshot();
  const coverage = wheatPoolCoverageFromEngine();
  const remaining = remainingCoverageCapacity(coverage, metrics.wheatMintedSupply);
  return (
    <div>
      <PageHeader
        eyebrow={t("dashboard.issuerEyebrow")}
        title={t("nav.dashboard")}
        description={t("workspace.issuerOverviewIntro")}
      />
      <MetricStrip className="sm:grid-cols-2 lg:grid-cols-3">
        <MetricCell
          emphasis="primary"
          label={t("workspace.eligibleBacking")}
          value={t("units.tonnes", {
            value: formatInteger(coverage.eligibleCoverageTonnes, locale),
          })}
        />
        <MetricCell
          label={t("workspace.availableIssuance")}
          value={t("units.tonnes", {
            value: formatInteger(remaining, locale),
          })}
        />
        <MetricCell
          label={t("workspace.tokenProgramme")}
          value="WHEAT-2027"
        />
        <MetricCell
          label={t("workspace.minted")}
          value={formatInteger(metrics.wheatMintedSupply, locale)}
        />
        <MetricCell
          label={t("dashboard.registrarInventory")}
          value={formatInteger(metrics.registrarInventory, locale)}
        />
        <MetricCell
          label={t("workspace.placementProgress")}
          value={formatInteger(metrics.primaryPlacementVolume, locale)}
        />
        <MetricCell
          label={t("dashboard.circulating")}
          value={formatInteger(metrics.circulatingSupply, locale)}
        />
        <MetricCell
          label={t("workspace.grossVolume")}
          value={t("units.tonnes", {
            value: formatInteger(coverage.grossVolumeTonnes, locale),
          })}
        />
      </MetricStrip>
    </div>
  );
}

async function RegistrarHome() {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const { metrics } = await getDashboardSnapshot();
  return (
    <div>
      <PageHeader
        eyebrow={t("dashboard.registrarEyebrow")}
        title={t("nav.dashboard")}
        description={t("dashboard.registrarIntro")}
      />
      <MetricStrip className="sm:grid-cols-4">
        <MetricCell
          emphasis="primary"
          label={t("dashboard.eligibleCoverage")}
          value={t("units.tonnes", {
            value: formatInteger(metrics.eligibleCoverageTonnes, locale),
          })}
        />
        <MetricCell
          label={t("dashboard.wheatMinted")}
          value={formatInteger(metrics.wheatMintedSupply, locale)}
        />
        <MetricCell
          label={t("dashboard.registrarInventory")}
          value={formatInteger(metrics.registrarInventory, locale)}
        />
        <MetricCell
          label={t("dashboard.primaryPlacement")}
          value={formatInteger(metrics.primaryPlacementVolume, locale)}
        />
      </MetricStrip>
      <MetricStrip>
        <MetricCell
          label={t("dashboard.circulating")}
          value={formatInteger(metrics.circulatingSupply, locale)}
        />
      </MetricStrip>
    </div>
  );
}

async function ProducerHome({ actor }: { actor: ActorContext }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const contracts = listContractsForActor(actor);
  const volume = contracts.reduce(
    (sum, item) => sum + item.contract.production.expectedProductionTonnes,
    0,
  );
  return (
    <div>
      <PageHeader
        eyebrow={actor.effective.organization?.name}
        title={t("nav.dashboard")}
        description={t("dashboard.producerIntro")}
      />
      <MetricStrip>
        <MetricCell
          label={t("dashboard.ownContracts")}
          value={formatInteger(contracts.length, locale)}
        />
        <MetricCell
          label={t("dashboard.ownVolume")}
          value={t("units.tonnes", { value: formatInteger(volume, locale) })}
        />
        <MetricCell
          label={t("dashboard.ownStatus")}
          value={contracts[0]?.contract.status ?? "—"}
        />
      </MetricStrip>
    </div>
  );
}

async function ScasHome({ actor }: { actor: ActorContext }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const contracts = listContractsForActor(actor);
  return (
    <div>
      <PageHeader
        eyebrow={t("nav.scas")}
        title={t("nav.dashboard")}
        description={t("dashboard.scasIntro")}
      />
      <MetricStrip>
        <MetricCell
          label={t("dashboard.verifiedOnChain")}
          value={formatInteger(contracts.length, locale)}
        />
      </MetricStrip>
    </div>
  );
}

async function InvestorHome({ actor }: { actor: ActorContext }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const portfolio = await getInvestorPortfolio(actor);
  return (
    <div>
      <PageHeader
        eyebrow={actor.effective.organization?.name}
        title={t("nav.dashboard")}
        description={t("dashboard.investorIntro")}
      />
      <MetricStrip>
        <MetricCell
          emphasis="primary"
          label={t("portfolio.holding")}
          value={
            portfolio?.quantityLive != null
              ? formatInteger(portfolio.quantityLive, locale)
              : t("portfolio.unavailable")
          }
        />
        <MetricCell label={t("portfolio.placement")} value={portfolio?.placementId ?? "—"} />
        <MetricCell
          label={t("dashboard.eligibleCoverage")}
          value={
            portfolio
              ? t("units.tonnes", {
                  value: formatInteger(portfolio.coverage, locale),
                })
              : "—"
          }
        />
      </MetricStrip>
    </div>
  );
}

async function TraderHome() {
  const t = await getTranslations();
  return (
    <div>
      <PageHeader
        eyebrow={t("nav.marketPage")}
        title={t("nav.dashboard")}
        description={t("dashboard.traderIntro")}
      />
      <p className="rounded-sm border border-border bg-card p-4 text-sm text-muted-foreground">
        {t("workspace.secondaryBody")}
      </p>
    </div>
  );
}

async function ComplianceHome() {
  const t = await getTranslations();
  return (
    <div>
      <PageHeader
        eyebrow={t("nav.compliance")}
        title={t("nav.dashboard")}
        description={t("dashboard.complianceIntro")}
      />
    </div>
  );
}

export function PublicMetricsNote() {
  return null;
}
