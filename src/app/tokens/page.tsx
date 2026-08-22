import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { IssuanceDesk } from "@/components/tokens/issuance-desk";
import { TokenMintProofPanel } from "@/components/tokens/token-mint-proof-panel";
import { DataList } from "@/components/shared/data-list";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { FactStrip } from "@/components/shared/fact-strip";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import {
  ON_CHAIN_DEMO_PLACEMENT_ID,
} from "@/adapters/blockchain";
import { getIssuanceDesk } from "@/services/token-service";
import {
  getPlacementSnapshot,
  getPrimaryTokenWithSupply,
  placementFromSnapshot,
} from "@/services/placement-service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tokens");
  return { title: t("title") };
}

export default async function TokensPage() {
  await requirePermission("issuance.read");
  const t = await getTranslations("tokens");
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = await getPlacementSnapshot();
  const placement = placementFromSnapshot(snapshot);
  const { token, pool } = getPrimaryTokenWithSupply(snapshot.supply);
  const desk = getIssuanceDesk({
    mintDeployed: snapshot.mintLookup.status === "found",
    outstandingTokens: snapshot.supply.mintedSupply,
  });
  const { coverage } = desk;
  const remainingForPlacement = Math.max(
    0,
    snapshot.supply.mintedSupply - snapshot.supply.placed,
  );

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={token.symbol}
        description={t("description")}
      />
      <p className="mb-5 text-xs text-muted-foreground">{t("hypothesis")}</p>
      <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
        {t("claimBoundary")}
      </p>

      <FactStrip
        className="mb-6"
        items={[
          { label: t("fields.instrument"), value: token.symbol },
          { label: t("fields.issuer"), value: token.issuerName },
          {
            label: t("fields.contractPool"),
            value: (
              <Link
                href={`/pools/${pool.id}`}
                className="font-tabular text-xs text-primary hover:underline"
              >
                {pool.id}
              </Link>
            ),
          },
          {
            label: t("supply.minted"),
            value: tUnits("tonnes", {
              value: formatInteger(snapshot.supply.mintedSupply, locale),
            }),
          },
          {
            label: t("supply.placed"),
            value: tUnits("tonnes", {
              value: formatInteger(snapshot.supply.placed, locale),
            }),
          },
          {
            label: t("fields.blockchainStatus"),
            value: (
              <StatusBadge
                value={
                  snapshot.mintLookup.status === "found"
                    ? "DEPLOYED"
                    : token.blockchainStatus
                }
              />
            ),
          },
        ]}
      />

      <PageSection title={t("termsTitle")} description={t("termsIntro")}>
        <DataList
          items={[
            {
              label: t("fields.type"),
              value: lookupMessage(tCatalog, `tokenType.${token.id}`),
            },
            {
              label: t("fields.claim"),
              value: t("claimIssuer"),
            },
            {
              label: t("fields.tokenUnit"),
              value: lookupMessage(tCatalog, `tokenUnit.${token.id}`),
            },
            {
              label: t("fields.redemption"),
              value: t("redemptionGrain"),
            },
            {
              label: t("fields.window"),
              value: token.terms.redemptionWindow,
            },
            {
              label: t("underlyingPool"),
              value: (
                <Link
                  href={`/pools/${pool.id}`}
                  className="text-primary hover:underline"
                >
                  {lookupMessage(tCatalog, `pools.${pool.id}`)}
                </Link>
              ),
            },
            { label: t("fields.network"), value: token.network },
          ]}
        />
        <p className="mt-3 text-xs text-muted-foreground">{t("financialNote")}</p>
      </PageSection>

      <PageSection title={t("supplyTitle")} description={t("supplyIntro")}>
        {!snapshot.liveBalances &&
        (snapshot.mintLookup.status === "unavailable" ||
          snapshot.lookup.status === "unavailable" ||
          snapshot.registrarWheat.status === "unavailable") ? (
          <EmptyState>{t("proofUnavailable")}</EmptyState>
        ) : null}
        <MetricStrip className="sm:grid-cols-2 lg:grid-cols-3">
          <MetricCell
            label={t("supply.maxCapacity")}
            value={tUnits("tonnes", {
              value: formatInteger(snapshot.supply.maximumCoverageCapacity, locale),
            })}
          />
          <MetricCell
            label={t("supply.minted")}
            value={formatInteger(snapshot.supply.mintedSupply, locale)}
          />
          <MetricCell
            label={t("supply.registrar")}
            value={formatInteger(snapshot.supply.registrarInventory, locale)}
          />
          <MetricCell
            label={t("supply.placed")}
            value={formatInteger(snapshot.supply.placed, locale)}
          />
          <MetricCell
            label={t("supply.circulating")}
            value={formatInteger(snapshot.supply.circulating, locale)}
          />
          <MetricCell
            label={t("supply.burned")}
            value={formatInteger(snapshot.supply.burned, locale)}
          />
        </MetricStrip>
        <p className="mt-3 text-xs text-muted-foreground">{t("supplyNotSold")}</p>
      </PageSection>

      <PageSection title={t("issuanceTitle")} description={t("issuanceIntro")}>
        <DataList
          items={[
            { label: t("fields.issuanceId"), value: placement.issuanceId },
            {
              label: t("supply.minted"),
              value: formatInteger(snapshot.supply.mintedSupply, locale),
            },
            {
              label: t("supply.registrar"),
              value: formatInteger(snapshot.supply.registrarInventory, locale),
            },
            {
              label: t("supply.placed"),
              value: formatInteger(snapshot.supply.placed, locale),
            },
            {
              label: t("supply.remainingPlacement"),
              value: formatInteger(remainingForPlacement, locale),
            },
            {
              label: t("supply.investors"),
              value: formatInteger(snapshot.supply.placed > 0 ? 1 : 0, locale),
            },
            {
              label: t("supply.placementStatus"),
              value: t("devnetDemonstrator"),
            },
            {
              label: t("fields.placement"),
              value: (
                <Link
                  href={`/market/${ON_CHAIN_DEMO_PLACEMENT_ID}`}
                  className="font-tabular text-xs text-primary hover:underline"
                >
                  {ON_CHAIN_DEMO_PLACEMENT_ID}
                </Link>
              ),
            },
          ]}
        />
      </PageSection>

      <PageSection title={t("capTitle")} description={t("capIntro")}>
        <MetricStrip className="sm:grid-cols-2 lg:grid-cols-4">
          <MetricCell
            label={t("cap.gross")}
            value={tUnits("tonnes", {
              value: formatInteger(coverage.grossVolumeTonnes, locale),
            })}
          />
          <MetricCell
            label={t("cap.eligible")}
            value={tUnits("tonnes", {
              value: formatInteger(coverage.eligibleCoverageTonnes, locale),
            })}
          />
          <MetricCell
            label={t("supply.minted")}
            value={tUnits("tonnes", {
              value: formatInteger(snapshot.supply.mintedSupply, locale),
            })}
          />
          <MetricCell
            label={t("cap.remaining")}
            value={tUnits("tonnes", {
              value: formatInteger(desk.remaining, locale),
            })}
          />
        </MetricStrip>
      </PageSection>

      <PageSection title={t("deskTitle")} description={t("deskIntro")}>
        <IssuanceDesk
          tokenId={token.id}
          eligibleCoverageTonnes={coverage.eligibleCoverageTonnes}
          outstandingTokens={snapshot.supply.mintedSupply}
          mintDeployed={desk.mintDeployed}
          gates={desk.gates}
        />
      </PageSection>

      <TokenMintProofPanel
        lookup={snapshot.mintLookup}
        locale={locale}
        registrarInventory={snapshot.supply.registrarInventory}
      />
    </div>
  );
}
