import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ActorContext } from "@/domain/identity";
import { listContractsForActor } from "@/services/access-service";
import { getDashboardSnapshot } from "@/services/dashboard-service";
import { getInvestorPortfolio } from "@/services/portfolio-service";
import { loadAdminOverview } from "@/services/admin-service";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { remainingCoverageCapacity } from "@/services/workspace-view";
import { listAssetInstruments, listProtocolInvestments } from "@/services/market-core-service";
import {
  DeskFigure,
  DeskLedger,
  DeskNote,
  DeskRow,
  DeskStage,
  deskIndex,
} from "@/components/surface/desk-stage";
import { EmptyState } from "@/components/shared/page-section";
import { buttonVariants } from "@/components/ui/button";
import { lookupMessage } from "@/i18n/t-dynamic";
import { formatInteger } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  const pending = overview?.pendingRequests ?? 0;
  return (
    <>
      <DeskStage
        kicker={t("admin.eyebrow")}
        title={t("desk.adminTitle")}
        lead={t("admin.dashboardIntro")}
        photo="/media/grain-kernel-macro.png"
        figure={
          <DeskFigure
            label={t("admin.pendingRequests")}
            value={String(pending)}
            meta={[
              { label: t("admin.users"), value: String(overview?.users ?? "—") },
              { label: t("admin.organizations"), value: String(overview?.organizations ?? "—") },
              { label: t("admin.memberships"), value: String(overview?.memberships ?? "—") },
            ]}
          />
        }
      />
      <DeskLedger>
        <DeskRow
          href="/admin/users"
          index={deskIndex(0)}
          kicker={t("nav.users")}
          title={t("admin.users")}
          value={String(overview?.users ?? "—")}
        />
        <DeskRow
          href="/admin/organizations"
          index={deskIndex(1)}
          kicker={t("nav.organizations")}
          title={t("admin.organizations")}
          value={String(overview?.organizations ?? "—")}
        />
        <DeskRow
          href="/admin/requests"
          index={deskIndex(2)}
          kicker={t("nav.roleRequests")}
          title={t("admin.pendingRequests")}
          value={String(pending)}
        />
      </DeskLedger>
    </>
  );
}

async function RegulatorHome() {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const { metrics } = await getDashboardSnapshot();
  const issued = listAssetInstruments().filter((item) => item.status === "ISSUED");
  const concepts = [
    ...listAssetInstruments().filter((item) => item.status !== "ISSUED"),
    ...listProtocolInvestments(),
  ];
  return (
    <>
      <DeskStage
        kicker={t("nav.supervision")}
        title={t("desk.regulatorTitle")}
        lead={t("dashboard.regulatorIntro")}
        photo="/media/grain-kernel-macro.png"
        figure={
          <DeskFigure
            label={t("marketCore.marketStatus")}
            value={t("marketCore.closedSecondary")}
            meta={[
              {
                label: t("marketCore.issuedInstruments"),
                value: formatInteger(issued.length, locale),
              },
              {
                label: t("marketCore.conceptsStructuring"),
                value: formatInteger(concepts.length, locale),
              },
              {
                label: t("dashboard.primaryPlacement"),
                value: formatInteger(metrics.primaryPlacementVolume, locale),
              },
            ]}
          />
        }
      />
      <DeskLedger>
        <DeskRow
          href="/supervision"
          index={deskIndex(0)}
          kicker={t("nav.supervision")}
          title={t("nav.supervision")}
        />
        <DeskRow
          href="/markets"
          index={deskIndex(1)}
          kicker={t("nav.markets")}
          title={t("marketCore.marketsTitle")}
          value={formatInteger(issued.length, locale)}
        />
        <DeskRow
          href="/registry"
          index={deskIndex(2)}
          kicker={t("nav.holdingsRegistry")}
          title={t("desk.openRegistry")}
        />
      </DeskLedger>
    </>
  );
}

async function IssuerHome() {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const { metrics } = await getDashboardSnapshot();
  const coverage = wheatPoolCoverageFromEngine();
  const remaining = remainingCoverageCapacity(coverage, metrics.wheatMintedSupply);
  return (
    <>
      <DeskStage
        kicker={t("dashboard.issuerEyebrow")}
        title={t("desk.issuerTitle")}
        lead={t("workspace.issuerOverviewIntro")}
        photo="/media/hero-harvest-dusk.png"
        figure={
          <DeskFigure
            label={t("workspace.availableIssuance")}
            value={t("units.tonnes", { value: formatInteger(remaining, locale) })}
            meta={[
              {
                label: t("workspace.eligibleBacking"),
                value: t("units.tonnes", {
                  value: formatInteger(coverage.eligibleCoverageTonnes, locale),
                }),
              },
              {
                label: t("workspace.minted"),
                value: formatInteger(metrics.wheatMintedSupply, locale),
              },
              {
                label: t("workspace.placementProgress"),
                value: formatInteger(metrics.primaryPlacementVolume, locale),
              },
            ]}
          />
        }
      />
      <DeskLedger>
        <DeskRow
          href="/coverage"
          index={deskIndex(0)}
          kicker={t("nav.coverage")}
          title={t("workspace.eligibleBacking")}
          value={t("units.tonnes", {
            value: formatInteger(coverage.eligibleCoverageTonnes, locale),
          })}
        />
        <DeskRow
          href="/issuances"
          index={deskIndex(1)}
          kicker={t("nav.issuance")}
          title="WHEAT-2027"
          value={formatInteger(metrics.wheatMintedSupply, locale)}
        />
        <DeskRow
          href="/registry"
          index={deskIndex(2)}
          kicker={t("dashboard.registrarInventory")}
          title={t("desk.openRegistry")}
          value={formatInteger(metrics.registrarInventory, locale)}
        />
      </DeskLedger>
    </>
  );
}

async function RegistrarHome() {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const { metrics } = await getDashboardSnapshot();
  return (
    <>
      <DeskStage
        kicker={t("dashboard.registrarEyebrow")}
        title={t("desk.registrarTitle")}
        lead={t("dashboard.registrarIntro")}
        photo="/media/grain-kernel-macro.png"
        figure={
          <DeskFigure
            label={t("dashboard.eligibleCoverage")}
            value={t("units.tonnes", {
              value: formatInteger(metrics.eligibleCoverageTonnes, locale),
            })}
            meta={[
              {
                label: t("dashboard.wheatMinted"),
                value: formatInteger(metrics.wheatMintedSupply, locale),
              },
              {
                label: t("dashboard.registrarInventory"),
                value: formatInteger(metrics.registrarInventory, locale),
              },
              {
                label: t("dashboard.primaryPlacement"),
                value: formatInteger(metrics.primaryPlacementVolume, locale),
              },
            ]}
          />
        }
      />
      <DeskLedger>
        <DeskRow
          href="/registry"
          index={deskIndex(0)}
          kicker={t("nav.holdingsRegistry")}
          title={t("desk.openRegistry")}
          value={formatInteger(metrics.registrarInventory, locale)}
        />
        <DeskRow
          href="/backing"
          index={deskIndex(1)}
          kicker={t("nav.backing")}
          title={t("dashboard.eligibleCoverage")}
          value={t("units.tonnes", {
            value: formatInteger(metrics.eligibleCoverageTonnes, locale),
          })}
        />
        <DeskRow
          href="/markets"
          index={deskIndex(2)}
          kicker={t("nav.markets")}
          title="WHEAT-2027"
          value={formatInteger(metrics.wheatMintedSupply, locale)}
        />
        <DeskRow
          href="/placements"
          index={deskIndex(3)}
          kicker={t("nav.placements")}
          title={t("dashboard.primaryPlacement")}
          value={formatInteger(metrics.primaryPlacementVolume, locale)}
        />
      </DeskLedger>
    </>
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
    <>
      <DeskStage
        kicker={actor.effective.organization?.name}
        title={t("desk.producerTitle")}
        lead={t("dashboard.producerIntro")}
        photo="/media/hero-harvest-dusk.png"
        figure={
          <DeskFigure
            label={t("dashboard.ownVolume")}
            value={
              contracts.length
                ? t("units.tonnes", { value: formatInteger(volume, locale) })
                : "—"
            }
            meta={
              contracts.length
                ? [
                    {
                      label: t("dashboard.ownContracts"),
                      value: formatInteger(contracts.length, locale),
                    },
                    {
                      label: t("dashboard.ownStatus"),
                      value: contracts[0]?.contract.status ?? "—",
                    },
                  ]
                : undefined
            }
          />
        }
      />
      {contracts.length === 0 ? (
        <EmptyState
          kicker={t("nav.myFields")}
          title={t("desk.noFieldsTitle")}
          body={t("desk.noFieldsBody")}
          action={
            <Link href="/fields" className={cn(buttonVariants())}>
              {t("desk.openContracts")}
            </Link>
          }
        />
      ) : (
        <DeskLedger>
          {contracts.map((item, index) => (
            <DeskRow
              key={item.contract.id}
              href={`/fields/${item.contract.id}`}
              index={deskIndex(index)}
              kicker={lookupMessage(t, `catalog.regions.${item.contract.field.region}`)}
              title={item.contract.field.cadastralRef}
              value={t("units.hectaresShort", {
                value: formatInteger(item.contract.field.areaHectares, locale),
              })}
              hint={item.contract.status}
            />
          ))}
        </DeskLedger>
      )}
    </>
  );
}

async function ScasHome({ actor }: { actor: ActorContext }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const contracts = listContractsForActor(actor);
  return (
    <>
      <DeskStage
        kicker={t("nav.scas")}
        title={t("desk.scasTitle")}
        lead={t("dashboard.scasIntro")}
        photo="/media/grain-kernel-macro.png"
        figure={
          <DeskFigure
            label={t("dashboard.verifiedOnChain")}
            value={formatInteger(contracts.length, locale)}
          />
        }
      />
      {contracts.length === 0 ? (
        <EmptyState
          kicker={t("nav.scas")}
          title={t("desk.noneOnBook")}
          body={t("dashboard.scasIntro")}
        />
      ) : (
        <DeskLedger>
          {contracts.slice(0, 8).map((item, index) => (
            <DeskRow
              key={item.contract.id}
              href={`/contracts/${item.contract.id}`}
              index={deskIndex(index)}
              kicker={item.contract.id}
              title={item.producer.legalName}
              hint={item.contract.status}
            />
          ))}
          <DeskRow href="/scas" index={deskIndex(contracts.length)} title={t("nav.scas")} />
        </DeskLedger>
      )}
    </>
  );
}

async function InvestorHome({ actor }: { actor: ActorContext }) {
  const t = await getTranslations();
  const locale = (await getLocale()) as AppLocale;
  const portfolio = await getInvestorPortfolio(actor);
  const holding =
    portfolio?.quantityLive != null
      ? formatInteger(portfolio.quantityLive, locale)
      : t("portfolio.unavailable");
  return (
    <>
      <DeskStage
        kicker={actor.effective.organization?.name}
        title={t("desk.investorTitle")}
        lead={t("dashboard.investorIntro")}
        photo="/media/grain-kernel-macro.png"
        figure={
          <DeskFigure
            label={t("portfolio.holding")}
            value={holding}
            meta={[
              { label: t("portfolio.placement"), value: portfolio?.placementId ?? "—" },
              {
                label: t("marketCore.sectionMarket"),
                value: t("marketCore.secondaryNotOpen"),
              },
            ]}
          />
        }
      />
      <DeskNote className="mb-8">{t("marketCore.protocolInvestmentNote")}</DeskNote>
      <DeskLedger>
        <DeskRow
          href="/portfolio"
          index={deskIndex(0)}
          kicker={t("nav.portfolio")}
          title={t("portfolio.holding")}
          value={holding}
        />
        <DeskRow
          href="/secondary"
          index={deskIndex(1)}
          kicker={t("nav.secondary")}
          title={t("desk.secondaryClosed")}
        />
      </DeskLedger>
    </>
  );
}

async function TraderHome() {
  const t = await getTranslations();
  return (
    <>
      <DeskStage
        kicker={t("nav.markets")}
        title={t("desk.traderTitle")}
        lead={t("dashboard.traderIntro")}
        photo="/media/empty-silo-light.png"
        figure={
          <DeskFigure
            label={t("marketCore.sectionMarket")}
            value={t("marketCore.closedSecondary")}
          />
        }
      />
      <EmptyState
        kicker={t("nav.secondary")}
        title={t("desk.secondaryClosed")}
        body={t("desk.secondaryClosedBody")}
        action={
          <Link href="/instruments" className={cn(buttonVariants())}>
            {t("desk.openInstruments")}
          </Link>
        }
      />
    </>
  );
}

async function ComplianceHome() {
  const t = await getTranslations();
  return (
    <>
      <DeskStage
        kicker={t("nav.compliance")}
        title={t("desk.complianceTitle")}
        lead={t("dashboard.complianceIntro")}
        photo="/media/empty-silo-light.png"
      />
      <DeskLedger>
        <DeskRow href="/compliance/checks" index={deskIndex(0)} title={t("nav.checks")} />
        <DeskRow href="/compliance/alerts" index={deskIndex(1)} title={t("nav.alerts")} />
        <DeskRow href="/compliance/eligibility" index={deskIndex(2)} title={t("nav.eligibility")} />
        <DeskRow href="/participants" index={deskIndex(3)} title={t("nav.participants")} />
      </DeskLedger>
    </>
  );
}

export function PublicMetricsNote() {
  return null;
}
