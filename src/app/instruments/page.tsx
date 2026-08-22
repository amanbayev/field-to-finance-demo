import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { lookupMessage } from "@/i18n/t-dynamic";
import { requirePermission } from "@/lib/auth/guard";
import { ASSET_CLASS_KEYS } from "@/lib/market-core/presentation";
import {
  listAssetInstruments,
  listProtocolInvestments,
} from "@/services/market-core-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("instrumentsTitle") };
}

export default async function InstrumentsPage() {
  await requirePermission("issuance.read", "market.read");
  const t = await getTranslations("marketCore");
  const assets = listAssetInstruments();
  const protocolInvestments = listProtocolInvestments();

  return (
    <div>
      <PageHeader
        eyebrow={t("levelInstrument")}
        title={t("instrumentsTitle")}
        description={t("instrumentsIntro")}
      />
      <p className="mb-5 text-sm">{t("protocolInvestmentNote")}</p>

      <PageSection title={t("assetFamily")}>
        <ul className="grid gap-3">
          {assets.map((item) => (
            <li key={item.id} className="border border-border bg-card px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/instruments/${item.id}`}
                  className="font-heading text-lg tracking-tight text-primary hover:underline"
                >
                  {item.symbol}
                </Link>
                <MarketStatusChip
                  label={lookupMessage(t, `status${item.status}`)}
                  tone={item.status}
                />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{item.name}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {lookupMessage(t, ASSET_CLASS_KEYS[item.assetClass])} ·{" "}
                {lookupMessage(t, `type${item.instrumentType}`)}
              </p>
            </li>
          ))}
        </ul>
      </PageSection>

      <PageSection title={t("protocolFamily")}>
        <p className="mb-3 text-sm text-muted-foreground">{t("noFakeEconomics")}</p>
        <ul className="grid gap-3">
          {protocolInvestments.map((item) => (
            <li key={item.id} className="border border-dashed border-border bg-card px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/instruments/${item.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {item.name}
                </Link>
                <MarketStatusChip label={t("protocolInvestmentStatus")} tone="FUTURE" />
              </div>
            </li>
          ))}
        </ul>
      </PageSection>
    </div>
  );
}
