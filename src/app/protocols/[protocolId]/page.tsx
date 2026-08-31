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
import {
  DeskLedger,
  DeskNote,
  DeskRow,
  deskIndex,
} from "@/components/surface/desk-stage";
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
  PROTOCOL_VERSION_GOVERNANCE_KEYS,
  PROTOCOL_VERSION_STATE_KEYS,
  f2fModuleHref,
  protocolStatusKey,
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
  const { protocol, instruments, vehicle, currentVersion } = context;
  const rules = currentVersion?.rules ?? null;
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
          label={lookupMessage(t, protocolStatusKey(protocol.status))}
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
          {
            label: t("verification"),
            value: rules ? rules.verificationModel : t("noActiveProtocolVersion"),
          },
          {
            label: t("protocolVersion"),
            value: currentVersion
              ? `${currentVersion.id} · ${currentVersion.displayVersion}`
              : t("noActiveProtocolVersion"),
          },
          { label: t("regulatory"), value: t("demonstratorOnly") },
        ]}
      />

      <PageSection title={t("protocolWorld")}>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {lookupMessage(t, protocolWorldKey(protocol.id))}
        </p>
      </PageSection>

      {protocol.id === "F2F" ? (
        <p className="mt-4 text-xs text-muted-foreground">
          {t("notTokenType")} {t("notMarket")}
        </p>
      ) : null}

      <PageSection title={t("protocolVersionTitle")} description={t("protocolVersionIntro")}>
        {currentVersion && rules ? (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <MarketStatusChip
                label={lookupMessage(t, PROTOCOL_VERSION_STATE_KEYS[currentVersion.state])}
                tone={currentVersion.state === "ACTIVE" ? "ACTIVE" : "STRUCTURING"}
              />
              {currentVersion.frozen ? (
                <MarketStatusChip label={t("immutableRules")} tone="ACTIVE" />
              ) : null}
            </div>
            <DataList
              items={[
                { label: t("protocolVersionId"), value: currentVersion.id },
                { label: t("protocolVersionDisplay"), value: currentVersion.displayVersion },
                {
                  label: t("protocolVersionState"),
                  value: lookupMessage(t, PROTOCOL_VERSION_STATE_KEYS[currentVersion.state]),
                },
                {
                  label: t("protocolVersionActivated"),
                  value: currentVersion.activatedAt ?? t("dateNotClaimed"),
                },
                {
                  label: t("protocolVersionFrozenAt"),
                  value: currentVersion.frozenAt ?? t("dateNotClaimed"),
                },
              ]}
            />
            <div>
              <p className="label-caps text-harvest">{t("protocolRules")}</p>
              <DataList
                items={[
                  { label: t("verification"), value: rules.verificationModel },
                  { label: t("riskModel"), value: rules.riskModel },
                  { label: t("coverageModel"), value: rules.coverageModel },
                  { label: t("issuanceModel"), value: rules.issuanceModel },
                  { label: t("redemptionModel"), value: rules.redemptionModel },
                ]}
              />
            </div>
            <p className="text-xs text-straw">
              {PROTOCOL_VERSION_GOVERNANCE_KEYS[currentVersion.id]
                ? lookupMessage(t, PROTOCOL_VERSION_GOVERNANCE_KEYS[currentVersion.id]!)
                : currentVersion.governanceNote}
            </p>
          </div>
        ) : (
          <p className="text-sm text-straw">{t("noActiveProtocolVersion")}</p>
        )}
      </PageSection>

      {rules && rules.lifecycle.length > 0 ? (
        <PageSection title={t("protocolPath")}>
          <WorkflowStrip
            steps={rules.lifecycle.map((step) =>
              lookupMessage(t, LIFECYCLE_KEYS[step] ?? step),
            )}
          />
        </PageSection>
      ) : null}

      {protocol.id === "F2F" && rules && rules.modules.length > 0 ? (
        <PageSection title={t("f2fModules")}>
        <DeskLedger>
          {rules.modules.map((moduleId, index) => {
            const href = f2fModuleHref(moduleId, actor);
            const label = lookupMessage(t, MODULE_KEYS[moduleId] ?? moduleId);
            return (
              <DeskRow
                key={moduleId}
                href={href ?? undefined}
                index={deskIndex(index)}
                title={label}
              />
            );
          })}
        </DeskLedger>
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
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="label-caps text-harvest">{t("issuedInstruments")}</p>
            {assetInstruments.filter((item) => item.status === "ISSUED").length > 0 ? (
              <DeskLedger className="mt-3">
                {assetInstruments
                  .filter((item) => item.status === "ISSUED")
                  .map((item, index) => (
                    <DeskRow
                      key={item.id}
                      href={`/instruments/${item.id}`}
                      index={deskIndex(index)}
                      title={item.symbol}
                      hint={t("issuedDemonstratorInstrument")}
                    />
                  ))}
              </DeskLedger>
            ) : (
              <p className="mt-2 text-sm text-straw">{t("noIssuedInstruments")}</p>
            )}
          </div>
          <div>
            <p className="label-caps text-harvest">{t("conceptsStructuring")}</p>
            <DeskNote className="mt-3">{t("protocolInvestmentNote")}</DeskNote>
            {protocolInvestments.length > 0 ? (
              <DeskLedger className="mt-3">
                {protocolInvestments.map((item, index) => (
                  <DeskRow
                    key={item.id}
                    href={`/instruments/${item.id}`}
                    index={deskIndex(index)}
                    title={item.name}
                    hint={t("protocolInvestmentFlags")}
                    value={
                      <MarketStatusChip
                        label={t("protocolInvestmentStatus")}
                        tone="STRUCTURING"
                      />
                    }
                  />
                ))}
              </DeskLedger>
            ) : (
              <p className="mt-2 text-sm text-straw">{t("protocolInvestmentStatus")}</p>
            )}
            {vehicle ? (
              <p className="mt-3 text-xs text-straw">
                {t("possibleModels")}:{" "}
                {vehicle.possibleModels
                  .map((model) => lookupMessage(t, PROTOCOL_INVESTMENT_MODEL_KEYS[model]))
                  .join(" · ")}
              </p>
            ) : null}
            <p className="mt-2 text-xs text-straw">{t("noFakeEconomics")}</p>
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
