import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DataList } from "@/components/shared/data-list";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import {
  explorerAddressUrl,
  explorerTxUrl,
  ON_CHAIN_DEMO_PLACEMENT_ID,
  shortenKey,
} from "@/adapters/blockchain";
import {
  getPlacementSnapshot,
  placementFromSnapshot,
} from "@/services/placement-service";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ placementId: string }>;
}): Promise<Metadata> {
  const { placementId } = await params;
  return { title: placementId };
}

export default async function PlacementDetailPage({
  params,
}: {
  params: Promise<{ placementId: string }>;
}) {
  const { placementId } = await params;
  if (placementId !== ON_CHAIN_DEMO_PLACEMENT_ID) {
    notFound();
  }
  const actor = await requirePermission(
    "placement.read.all",
    "placement.read.own",
    "market.read",
  );
  void actor;
  const t = await getTranslations("market");
  const tTokens = await getTranslations("tokens");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = await getPlacementSnapshot();
  const placement = placementFromSnapshot(snapshot);
  const wallet = placement.investorWallet
    ? shortenKey(placement.investorWallet)
    : tTokens("notRecorded");

  return (
    <div>
      <PageHeader
        eyebrow={t("placementEyebrow")}
        title={placement.id}
        description={t("placementIntro")}
      />
      {snapshot.lookup.status === "unavailable" ? (
        <EmptyState>{t("proofUnavailable")}</EmptyState>
      ) : null}
      <PageSection title={t("placementFacts")}>
        <DataList
          items={[
            {
              label: tTokens("fields.instrument"),
              value: (
                <Link href="/instruments/WHEAT-2027" className="text-primary hover:underline">
                  {placement.instrumentSymbol}
                </Link>
              ),
            },
            { label: tTokens("fields.issuanceId"), value: placement.issuanceId },
            {
              label: t("investorReference"),
              value: placement.investorReference,
            },
            {
              label: t("investorWallet"),
              value: placement.investorWallet ? (
                <a
                  href={explorerAddressUrl(placement.investorWallet)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-tabular text-xs text-primary hover:underline"
                >
                  {wallet}
                </a>
              ) : (
                wallet
              ),
            },
            {
              label: t("quantity"),
              value: formatInteger(placement.quantity, locale),
            },
            {
              label: t("settlementAsset"),
              value: placement.settlementAssetSymbol,
            },
            {
              label: t("settlementAmount"),
              value: formatInteger(placement.settlementAmount, locale),
            },
            {
              label: t("compliance"),
              value: t("complianceEligibleDemo"),
            },
            {
              label: t("settlementDestination"),
              value:
                placement.issuerSettlementReference ?? "ISSUER-SETTLEMENT-001",
            },
            {
              label: t("demoKztMint"),
              value: placement.settlementMint ? (
                <ExplorerLink href={explorerAddressUrl(placement.settlementMint)}>
                  {placement.settlementMint}
                </ExplorerLink>
              ) : (
                tTokens("notRecorded")
              ),
            },
            {
              label: t("walletOwnership"),
              value: <StatusBadge value={placement.walletOwnership} />,
            },
            {
              label: t("status"),
              value: <StatusBadge value="SETTLED" />,
            },
            {
              label: t("settlementMethod"),
              value: <StatusBadge value="ATOMIC_DVP" />,
            },
            { label: t("network"), value: placement.network },
            {
              label: t("marketProgram"),
              value: placement.marketProgramId ? (
                <ExplorerLink href={explorerAddressUrl(placement.marketProgramId)}>
                  {placement.marketProgramId}
                </ExplorerLink>
              ) : (
                tTokens("notRecorded")
              ),
            },
            {
              label: t("placementPda"),
              value: placement.placementPda ? (
                <ExplorerLink href={explorerAddressUrl(placement.placementPda)}>
                  {placement.placementPda}
                </ExplorerLink>
              ) : (
                tTokens("notRecorded")
              ),
            },
            {
              label: t("dvpTx"),
              value: placement.dvpSignature ? (
                <ExplorerLink href={explorerTxUrl(placement.dvpSignature)}>
                  {placement.dvpSignature}
                </ExplorerLink>
              ) : (
                tTokens("notRecorded")
              ),
            },
          ]}
        />
        <p className="mt-3 text-xs text-muted-foreground">{t("priceNote")}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("demoKztDisclaimer")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("settlementDestinationNote")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{t("privacyNote")}</p>
      </PageSection>
    </div>
  );
}

function ExplorerLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all font-tabular text-xs text-primary hover:underline"
      title={children}
    >
      {children}
    </a>
  );
}
