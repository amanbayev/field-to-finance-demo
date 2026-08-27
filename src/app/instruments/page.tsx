import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { DeskLedger, DeskNote, DeskRow, deskIndex } from "@/components/surface/desk-stage";
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
  const issued = listAssetInstruments().filter((item) => item.status === "ISSUED");
  const structuringAssets = listAssetInstruments().filter((item) => item.status !== "ISSUED");
  const protocolInvestments = listProtocolInvestments();
  const structuring = [...structuringAssets, ...protocolInvestments];

  return (
    <div>
      <PageHeader
        eyebrow={t("levelInstrument")}
        title={t("instrumentsTitle")}
        description={t("instrumentsIntro")}
        photo="/media/grain-kernel-macro.png"
      />

      <PageSection title={t("issuedInstruments")}>
        <DeskLedger>
          {issued.map((item, index) => (
            <DeskRow
              key={item.id}
              href={`/instruments/${item.id}`}
              index={deskIndex(index)}
              kicker={lookupMessage(t, ASSET_CLASS_KEYS[item.assetClass])}
              title={item.symbol}
              hint={item.name}
              value={
                <MarketStatusChip
                  label={t("issuedDemonstratorInstrument")}
                  tone={item.status}
                />
              }
            />
          ))}
        </DeskLedger>
      </PageSection>

      <PageSection title={t("conceptsStructuring")}>
        <DeskNote className="mb-6">{t("protocolInvestmentNote")}</DeskNote>
        <DeskLedger>
          {structuring.map((item, index) => (
            <DeskRow
              key={item.id}
              href={`/instruments/${item.id}`}
              index={deskIndex(index)}
              title={
                item.instrumentType === "PROTOCOL_INVESTMENT" ? item.name : item.symbol
              }
              hint={t("protocolInvestmentFlags")}
              value={
                <MarketStatusChip label={t("protocolInvestmentStatus")} tone="STRUCTURING" />
              }
            />
          ))}
        </DeskLedger>
      </PageSection>
    </div>
  );
}
