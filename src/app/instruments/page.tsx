import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DataList } from "@/components/shared/data-list";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatPercent } from "@/lib/format";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import { requirePermission } from "@/lib/auth/guard";
import { getPlacementSnapshot } from "@/services/placement-service";
import { listTokens } from "@/services/token-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("instrumentsTitle") };
}

export default async function InstrumentsPage() {
  await requirePermission("issuance.read", "market.read");
  const t = await getTranslations("workspace");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = await getPlacementSnapshot();
  const coverage = wheatPoolCoverageFromEngine();
  const tokens = listTokens();

  return (
    <div>
      <PageHeader
        eyebrow={t("instrumentsEyebrow")}
        title={t("instrumentsTitle")}
        description={t("instrumentsIntro")}
      />
      <p className="mb-5 text-sm text-muted-foreground">{t("noBuy")}</p>
      {tokens.map((token) => (
        <PageSection key={token.id} title={token.symbol}>
          <DataList
            items={[
              { label: t("instrumentKind"), value: token.type },
              { label: t("holderRight"), value: t("holderRightValue") },
              { label: t("unitClaim"), value: t("unitClaim") },
              { label: t("deliveryWindow"), value: token.terms.redemptionWindow },
              {
                label: t("underlyingPool"),
                value: (
                  <Link
                    href={`/pools/${token.poolId}`}
                    className="font-tabular text-xs text-primary hover:underline"
                  >
                    {token.poolId}
                  </Link>
                ),
              },
              {
                label: token.symbol,
                value: (
                  <Link
                    href={`/tokens/${token.symbol}`}
                    className="text-primary hover:underline"
                  >
                    {token.symbol}
                  </Link>
                ),
              },
            ]}
          />
          <MetricStrip className="mt-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCell
              label={t("eligibleCoverage")}
              value={formatInteger(coverage.eligibleCoverageTonnes, locale)}
            />
            <MetricCell
              label={t("riskHaircut")}
              value={formatPercent(coverage.totalHaircutPercent, locale)}
            />
            <MetricCell
              label={t("minted")}
              value={formatInteger(snapshot.supply.mintedSupply, locale)}
            />
            <MetricCell
              label={t("placed")}
              value={formatInteger(snapshot.supply.placed, locale)}
            />
          </MetricStrip>
        </PageSection>
      ))}
    </div>
  );
}
