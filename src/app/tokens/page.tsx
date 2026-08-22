import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { IssuanceDesk } from "@/components/tokens/issuance-desk";
import { TokenMintProofPanel } from "@/components/tokens/token-mint-proof-panel";
import { DataList } from "@/components/shared/data-list";
import { FactStrip } from "@/components/shared/fact-strip";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { blockchainProvider } from "@/services/providers";
import { getIssuanceDesk } from "@/services/token-service";
import { ON_CHAIN_DEMO_TOKEN_ID } from "@/adapters/blockchain";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tokens");
  return { title: t("title") };
}

export default async function TokensPage() {
  const t = await getTranslations("tokens");
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const mintLookup = await blockchainProvider.getTokenMint(ON_CHAIN_DEMO_TOKEN_ID);
  const mintDeployed = mintLookup.status === "found";
  const desk = getIssuanceDesk({ mintDeployed });
  const { token, pool, coverage } = desk;

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={token.symbol}
        description={t("description")}
      />
      <p className="mb-5 text-xs text-muted-foreground">{t("hypothesis")}</p>

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
            label: t("fields.issued"),
            value: t("issuanceNotStarted"),
          },
          {
            label: t("fields.maximumIssuance"),
            value: formatInteger(token.maximumIssuance, locale),
          },
          {
            label: t("fields.blockchainStatus"),
            value: (
              <StatusBadge
                value={mintDeployed ? "DEPLOYED" : token.blockchainStatus}
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
            label={t("cap.outstanding")}
            value={tUnits("tonnes", {
              value: formatInteger(token.issued, locale),
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
          outstandingTokens={token.issued}
          mintDeployed={desk.mintDeployed}
          gates={desk.gates}
        />
      </PageSection>

      <TokenMintProofPanel lookup={mintLookup} locale={locale} />
    </div>
  );
}
