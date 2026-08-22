import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PlatformBreadcrumb } from "@/components/market-core/platform-breadcrumb";
import { SpvStack } from "@/components/market-core/spv-stack";
import { WorkflowStrip } from "@/components/market-core/workflow-strip";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { DataList } from "@/components/shared/data-list";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { ON_CHAIN_DEMO_CONTRACT_IDS, ON_CHAIN_DEMO_POOL_ID } from "@/adapters/blockchain";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { actorCan } from "@/domain/identity";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { requirePermission } from "@/lib/auth/guard";
import {
  ASSET_CLASS_KEYS,
  LIFECYCLE_KEYS,
  MODULE_KEYS,
  PROTOCOL_INVESTMENT_MODEL_KEYS,
  f2fModuleHref,
  protocolWorldKey,
} from "@/lib/market-core/presentation";
import { getPlacementSnapshot } from "@/services/placement-service";
import { getProtocolContext, listAssetProtocols } from "@/services/market-core-service";

export const dynamicParams = false;

export function generateStaticParams() {
  return listAssetProtocols().map((protocol) => ({ protocolId: protocol.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ protocolId: string }>;
}): Promise<Metadata> {
  const { protocolId } = await params;
  const context = getProtocolContext(protocolId);
  return { title: context?.protocol.name ?? protocolId };
}

export default async function ProtocolDetailPage({
  params,
}: {
  params: Promise<{ protocolId: string }>;
}) {
  const { protocolId } = await params;
  const actor = await requirePermission("market.read", "regulator.read");
  const context = getProtocolContext(protocolId);
  if (!context) {
    notFound();
  }
  const t = await getTranslations("marketCore");
  const locale = (await getLocale()) as AppLocale;
  const { protocol, instruments, vehicle } = context;
  const assetInstruments = instruments.filter((item) => item.instrumentType === "ASSET_TOKEN");
  const protocolInvestments = instruments.filter(
    (item) => item.instrumentType === "PROTOCOL_INVESTMENT",
  );
  const wheat = assetInstruments.find((item) => item.id === "WHEAT-2027");
  const coverage = protocol.id === "F2F" ? wheatPoolCoverageFromEngine() : null;
  const snapshot = protocol.id === "F2F" ? await getPlacementSnapshot() : null;
  const canOpenIssuance =
    actorCan(actor, "issuance.manage") || actorCan(actor, "regulator.read");
  const canOpenPool = actorCan(actor, "pools.read");

  return (
    <div>
      <PlatformBreadcrumb
        items={[
          { href: "/markets", label: t("breadcrumbMarkets") },
          { label: lookupMessage(t, ASSET_CLASS_KEYS[protocol.assetClass]) },
          { label: protocol.name },
        ]}
      />
      <PageHeader
        eyebrow={t("protocolTitle")}
        title={protocol.name}
        description={lookupMessage(t, protocolWorldKey(protocol.id))}
      />
      <div className="mb-6 flex flex-wrap gap-3">
        <MarketStatusChip
          label={lookupMessage(t, `status${protocol.status}`)}
          tone={protocol.status}
        />
        <span className="text-xs text-muted-foreground">
          {protocol.regulatoryStatus === "DEMONSTRATOR_ONLY"
            ? t("demonstratorOnly")
            : t("notSubmitted")}
        </span>
      </div>

      <DataList
        items={[
          { label: t("assetClass"), value: lookupMessage(t, ASSET_CLASS_KEYS[protocol.assetClass]) },
          { label: t("operator"), value: protocol.operator },
          { label: t("protocolOwner"), value: protocol.protocolOwner },
          { label: t("verification"), value: protocol.verificationModel },
          { label: t("regulatory"), value: t("demonstratorOnly") },
        ]}
      />

      <PageSection title={t("protocolWorld")}>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {lookupMessage(t, protocolWorldKey(protocol.id))}
        </p>
      </PageSection>

      {protocol.lifecycle.length > 0 ? (
        <PageSection title={t("protocolPath")}>
          <WorkflowStrip
            steps={protocol.lifecycle.map((step) =>
              lookupMessage(t, LIFECYCLE_KEYS[step] ?? step),
            )}
          />
        </PageSection>
      ) : null}

      {protocol.id === "F2F" && protocol.modules.length > 0 ? (
        <PageSection title={t("f2fModules")}>
          <ul className="grid gap-2 sm:grid-cols-3">
            {protocol.modules.map((moduleId) => {
              const href = f2fModuleHref(moduleId, actor);
              const label = lookupMessage(t, MODULE_KEYS[moduleId] ?? moduleId);
              return (
                <li key={moduleId} className="border border-border bg-card px-3 py-2 text-sm">
                  {href ? (
                    <Link href={href} className="text-primary hover:underline">
                      {label}
                    </Link>
                  ) : (
                    label
                  )}
                </li>
              );
            })}
          </ul>
        </PageSection>
      ) : null}

      {coverage && snapshot && wheat ? (
        <PageSection title={t("factsTitle")}>
          <MetricStrip className="sm:grid-cols-2 lg:grid-cols-4">
            <MetricCell
              label={t("onChainDacs")}
              value={formatInteger(ON_CHAIN_DEMO_CONTRACT_IDS.length, locale)}
            />
            <MetricCell
              label={t("pool")}
              value={
                canOpenPool ? (
                  <Link href={`/pools/${ON_CHAIN_DEMO_POOL_ID}`} className="text-primary hover:underline">
                    {ON_CHAIN_DEMO_POOL_ID}
                  </Link>
                ) : (
                  ON_CHAIN_DEMO_POOL_ID
                )
              }
            />
            <MetricCell
              label={t("gross")}
              value={formatInteger(coverage.grossVolumeTonnes, locale)}
            />
            <MetricCell
              label={t("eligibleCoverage")}
              value={formatInteger(coverage.eligibleCoverageTonnes, locale)}
            />
            <MetricCell
              label={t("instrument")}
              value={
                <Link href={`/instruments/${wheat.id}`} className="text-primary hover:underline">
                  {wheat.symbol}
                </Link>
              }
            />
            <MetricCell
              label={t("issuance")}
              value={
                wheat.issuanceId && canOpenIssuance ? (
                  <Link
                    href={`/issuances/${wheat.issuanceId}`}
                    className="text-primary hover:underline"
                  >
                    {wheat.issuanceId}
                  </Link>
                ) : (
                  wheat.issuanceId ?? "—"
                )
              }
            />
            <MetricCell label={t("placement")} value={t("placementId")} />
            <MetricCell
              label={t("heldBy")}
              value={formatInteger(snapshot.supply.circulating, locale)}
            />
          </MetricStrip>
        </PageSection>
      ) : null}

      <PageSection title={t("instrumentFamilies")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="border border-border bg-card px-4 py-3">
            <p className="label-caps text-muted-foreground">{t("assetFamily")}</p>
            {assetInstruments.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {assetInstruments.map((item) => (
                  <li key={item.id}>
                    <Link href={`/instruments/${item.id}`} className="text-primary hover:underline">
                      {item.symbol}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t("noAdmittedInstruments")}</p>
            )}
          </div>
          <div className="border border-border bg-card px-4 py-3">
            <p className="label-caps text-muted-foreground">{t("protocolFamily")}</p>
            <p className="mt-2 text-sm">{t("protocolInvestmentNote")}</p>
            {protocolInvestments.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {protocolInvestments.map((item) => (
                  <li key={item.id}>
                    <Link href={`/instruments/${item.id}`} className="text-primary hover:underline">
                      {item.name}
                    </Link>
                    <span className="ml-2">
                      <MarketStatusChip
                        label={t("protocolInvestmentStatus")}
                        tone="FUTURE"
                      />
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">{t("protocolInvestmentStatus")}</p>
            )}
            {vehicle ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("possibleModels")}:{" "}
                {vehicle.possibleModels
                  .map((model) => lookupMessage(t, PROTOCOL_INVESTMENT_MODEL_KEYS[model]))
                  .join(" · ")}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">{t("noFakeEconomics")}</p>
          </div>
        </div>
      </PageSection>

      <PageSection title={t("spvTitle")} description={t("spvNotRequired")}>
        <SpvStack
          title={t("spvTitle")}
          rows={[
            { label: t("rowProtocol"), value: protocol.name },
            {
              label: t("rowSpv"),
              value: wheat?.issuerName ?? t("futureSpv"),
            },
            {
              label: t("rowInstrument"),
              value: wheat?.symbol ?? t("futureInstrument"),
            },
            { label: t("rowMarket"), value: t("marketCore") },
          ]}
        />
      </PageSection>
    </div>
  );
}
