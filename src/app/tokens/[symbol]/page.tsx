import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { TokenMintProofPanel } from "@/components/tokens/token-mint-proof-panel";
import { DataList } from "@/components/shared/data-list";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import {
  explorerAddressUrl,
  TOKEN_2022_PROGRAM_ID,
} from "@/adapters/blockchain";
import { requirePermission } from "@/lib/auth/guard";
import { getPlacementSnapshot } from "@/services/placement-service";
import { getTokenBySymbol, listTokens } from "@/services/token-service";

export const dynamicParams = false;

export function generateStaticParams() {
  return listTokens().map((token) => ({ symbol: token.symbol }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  return { title: symbol };
}

export default async function InstrumentPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  await requirePermission("issuance.read");
  const detail = getTokenBySymbol(symbol);
  if (!detail) {
    notFound();
  }
  const t = await getTranslations("workspace");
  const tTokens = await getTranslations("tokens");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = await getPlacementSnapshot();
  const { token, pool } = detail;

  return (
    <div>
      <PageHeader
        eyebrow={t("instrumentEyebrow")}
        title={token.symbol}
        description={t("instrumentIntro")}
      />
      <DataList
        items={[
          { label: t("instrumentKind"), value: token.type },
          { label: t("holderRight"), value: t("holderRightValue") },
          { label: t("unitClaim"), value: t("unitClaim") },
          {
            label: t("deliveryWindow"),
            value: token.terms.redemptionWindow,
          },
          {
            label: t("underlyingPool"),
            value: (
              <Link
                href={`/pools/${pool.id}`}
                className="font-tabular text-xs text-primary hover:underline"
              >
                {pool.id}
              </Link>
            ),
          },
          { label: t("network"), value: token.network },
          {
            label: t("token2022Mint"),
            value: token.mintAddress ? (
              <a
                href={explorerAddressUrl(token.mintAddress)}
                target="_blank"
                rel="noreferrer"
                className="break-all font-tabular text-xs text-primary hover:underline"
              >
                {token.mintAddress}
              </a>
            ) : (
              t("notRecorded")
            ),
          },
          {
            label: tTokens("mintProof.program"),
            value: (
              <a
                href={explorerAddressUrl(TOKEN_2022_PROGRAM_ID)}
                target="_blank"
                rel="noreferrer"
                className="break-all font-tabular text-xs text-primary hover:underline"
              >
                {TOKEN_2022_PROGRAM_ID}
              </a>
            ),
          },
        ]}
      />

      <PageSection title={tTokens("supplyTitle")}>
        <MetricStrip className="sm:grid-cols-2 lg:grid-cols-3">
          <MetricCell
            label={t("maxCapacity")}
            value={formatInteger(snapshot.supply.maximumCoverageCapacity, locale)}
          />
          <MetricCell
            label={t("minted")}
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
            label={t("burned")}
            value={formatInteger(snapshot.supply.burned, locale)}
          />
        </MetricStrip>
      </PageSection>

      <TokenMintProofPanel
        lookup={snapshot.mintLookup}
        locale={locale}
        registrarInventory={snapshot.supply.registrarInventory}
      />
      <p className="mt-4 text-xs text-muted-foreground">
        <StatusBadge
          value={
            snapshot.mintLookup.status === "found" ? "DEPLOYED" : token.blockchainStatus
          }
        />
      </p>
    </div>
  );
}
