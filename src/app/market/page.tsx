import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DataList } from "@/components/shared/data-list";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { FactStrip } from "@/components/shared/fact-strip";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageHeader } from "@/components/shared/page-header";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import {
  explorerAddressUrl,
  ON_CHAIN_DEMO_PLACEMENT_ID,
  shortenKey,
} from "@/adapters/blockchain";
import {
  getPlacementSnapshot,
  getPrimaryTokenWithSupply,
  placementFromSnapshot,
} from "@/services/placement-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("market");
  return { title: t("title") };
}

export default async function MarketPage() {
  const t = await getTranslations("market");
  const tTokens = await getTranslations("tokens");
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = await getPlacementSnapshot();
  const placement = placementFromSnapshot(snapshot);
  const { token, pool } = getPrimaryTokenWithSupply(snapshot.supply);

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <p className="mb-5 text-xs text-muted-foreground">{t("demonstrator")}</p>

      <PageSection title={token.symbol} description={t("instrumentIntro")}>
        <FactStrip
          className="lg:grid-cols-4"
          items={[
            {
              label: tTokens("fields.type"),
              value: lookupMessage(tCatalog, `tokenType.${token.id}`),
            },
            {
              label: tTokens("fields.contractPool"),
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
              label: t("eligibleCoverage"),
              value: tUnits("tonnes", {
                value: formatInteger(
                  snapshot.supply.maximumCoverageCapacity,
                  locale,
                ),
              }),
            },
            {
              label: t("delivery"),
              value: token.terms.redemptionWindow,
            },
          ]}
        />
        <MetricStrip className="mt-px sm:grid-cols-2 lg:grid-cols-4">
          <MetricCell
            label={tTokens("supply.minted")}
            value={formatInteger(snapshot.supply.mintedSupply, locale)}
          />
          <MetricCell
            label={tTokens("supply.placed")}
            value={formatInteger(snapshot.supply.placed, locale)}
          />
          <MetricCell
            label={tTokens("supply.registrar")}
            value={formatInteger(snapshot.supply.registrarInventory, locale)}
          />
          <MetricCell
            label={t("status")}
            value={t("statusValue")}
          />
        </MetricStrip>
        <p className="mt-3 text-xs text-muted-foreground">{t("priceNote")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("demoKztDisclaimer")}
        </p>
        <div className="mt-4">
          <DataList
            items={[
            {
              label: t("eligibility"),
              value: t("eligibilityRequired"),
            },
            {
              label: t("unitPrice"),
              value: `${formatInteger(placement.simulatedUnitPrice, locale)} DEMO-KZT`,
            },
            {
              label: t("placement"),
              value: (
                <Link
                  href={`/market/${ON_CHAIN_DEMO_PLACEMENT_ID}`}
                  className="font-tabular text-xs text-primary hover:underline"
                >
                  {ON_CHAIN_DEMO_PLACEMENT_ID}
                </Link>
              ),
            },
            {
              label: t("marketProgram"),
              value: placement.marketProgramId ? (
                <a
                  href={explorerAddressUrl(placement.marketProgramId)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-tabular text-xs text-primary hover:underline"
                >
                  {shortenKey(placement.marketProgramId)}
                </a>
              ) : (
                tTokens("notRecorded")
              ),
            },
          ]}
          />
        </div>
      </PageSection>

      {snapshot.lookup.status === "unavailable" ? (
        <EmptyState>{t("proofUnavailable")}</EmptyState>
      ) : null}
    </div>
  );
}
