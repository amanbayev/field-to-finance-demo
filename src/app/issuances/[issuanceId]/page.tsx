import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { MarketCoreContextHeader } from "@/components/market-core/market-core-context-header";
import { IssuanceDesk } from "@/components/tokens/issuance-desk";
import { TokenMintProofPanel } from "@/components/tokens/token-mint-proof-panel";
import { DataList } from "@/components/shared/data-list";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageSection } from "@/components/shared/page-section";
import { actorCan } from "@/domain/identity";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import {
  ON_CHAIN_DEMO_ISSUANCE_ID,
  ON_CHAIN_DEMO_PLACEMENT_ID,
  ON_CHAIN_DEMO_POOL_ID,
} from "@/adapters/blockchain";
import { requirePermission } from "@/lib/auth/guard";
import { issuanceTrail } from "@/lib/market-core/hierarchy";
import {
  getPlacementSnapshot,
  placementFromSnapshot,
} from "@/services/placement-service";
import { getIssuanceDesk } from "@/services/token-service";
import {
  getAssetProtocol,
  listMarketInstruments,
} from "@/services/market-core-service";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ issuanceId: ON_CHAIN_DEMO_ISSUANCE_ID }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ issuanceId: string }>;
}): Promise<Metadata> {
  const { issuanceId } = await params;
  return { title: issuanceId };
}

export default async function IssuanceDetailPage({
  params,
}: {
  params: Promise<{ issuanceId: string }>;
}) {
  const { issuanceId } = await params;
  if (issuanceId !== ON_CHAIN_DEMO_ISSUANCE_ID) {
    notFound();
  }
  const actor = await requirePermission(
    "issuance.manage",
    "audit.read",
    "regulator.read",
  );
  const t = await getTranslations("workspace");
  const tCore = await getTranslations("marketCore");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = await getPlacementSnapshot();
  const placement = placementFromSnapshot(snapshot);
  const desk = getIssuanceDesk({
    mintDeployed: snapshot.mintLookup.status === "found",
    outstandingTokens: snapshot.supply.mintedSupply,
  });
  const showDesk = actorCan(actor, "issuance.manage");
  // Trail derived from the issuance's own instrument and protocol records
  // rather than hard-coded protocol and instrument routes.
  const issuanceInstrument =
    listMarketInstruments().find((item) => item.issuanceId === issuanceId) ?? null;
  const issuanceProtocol = issuanceInstrument
    ? (getAssetProtocol(issuanceInstrument.assetProtocolId) ?? null)
    : null;

  return (
    <div>
      <MarketCoreContextHeader
        level="ISSUANCE"
        trail={issuanceTrail(issuanceId, issuanceInstrument, issuanceProtocol)}
        translate={tCore}
        title={issuanceId}
        description={t("issuanceIntro")}
      />
      <p className="mb-5 text-xs text-muted-foreground">
        {t("noCommercialTerms")} {tCore("notTokenType")}
      </p>
      <DataList
        items={[
          { label: t("issuanceEyebrow"), value: issuanceId },
          {
            label: t("instrumentKind"),
            value: (
              <Link
                href="/instruments/WHEAT-2027"
                className="text-primary hover:underline"
              >
                WHEAT-2027
              </Link>
            ),
          },
          {
            label: t("relatedPool"),
            value: (
              <Link
                href={`/pools/${ON_CHAIN_DEMO_POOL_ID}`}
                className="font-tabular text-xs text-primary hover:underline"
              >
                {ON_CHAIN_DEMO_POOL_ID}
              </Link>
            ),
          },
          {
            label: t("relatedPlacement"),
            value: (
              <Link
                href={`/market/${ON_CHAIN_DEMO_PLACEMENT_ID}`}
                className="font-tabular text-xs text-primary hover:underline"
              >
                {placement.id}
              </Link>
            ),
          },
          { label: t("knownStatus"), value: t("settled") },
          { label: t("network"), value: placement.network },
        ]}
      />
      <PageSection title={t("mintedUnderProgramme")}>
        <MetricStrip className="sm:grid-cols-2 lg:grid-cols-3">
          <MetricCell
            label={t("mintedUnderProgramme")}
            value={formatInteger(snapshot.supply.mintedSupply, locale)}
          />
          <MetricCell
            label={t("registrarInventory")}
            value={formatInteger(snapshot.supply.registrarInventory, locale)}
          />
          <MetricCell
            label={t("placed")}
            value={formatInteger(snapshot.supply.placed, locale)}
          />
          <MetricCell
            label={t("circulating")}
            value={formatInteger(snapshot.supply.circulating, locale)}
          />
          <MetricCell
            label={t("coverageCapacity")}
            value={formatInteger(snapshot.supply.maximumCoverageCapacity, locale)}
          />
        </MetricStrip>
      </PageSection>
      {showDesk ? (
        <PageSection title={t("issuanceEyebrow")}>
          <IssuanceDesk
            tokenId={desk.token.id}
            eligibleCoverageTonnes={desk.coverage.eligibleCoverageTonnes}
            outstandingTokens={snapshot.supply.mintedSupply}
            mintDeployed={desk.mintDeployed}
            gates={desk.gates}
          />
        </PageSection>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">{t("noIssuerControls")}</p>
      )}
      <TokenMintProofPanel
        lookup={snapshot.mintLookup}
        locale={locale}
        registrarInventory={snapshot.supply.registrarInventory}
        allowMintActions={showDesk}
      />
    </div>
  );
}
