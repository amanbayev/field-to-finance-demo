import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MarketCoreContextHeader } from "@/components/market-core/market-core-context-header";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { PageSection } from "@/components/shared/page-section";
import { DeskLedger, DeskNote, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import type { MarketInstrument } from "@/domain/market-core";
import { lookupMessage } from "@/i18n/t-dynamic";
import { requirePermission } from "@/lib/auth/guard";
import {
  boundProtocolVersionHref,
  instrumentHref,
  platformTrail,
} from "@/lib/market-core/hierarchy";
import { ASSET_CLASS_KEYS } from "@/lib/market-core/presentation";
import {
  listAssetProtocols,
  listMarketInstruments,
} from "@/services/market-core-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("instrumentsTitle") };
}

export default async function InstrumentsPage() {
  await requirePermission("issuance.read", "market.read");
  const t = await getTranslations("marketCore");
  const protocols = listAssetProtocols();
  const instruments = listMarketInstruments();

  // Group by protocol, then by instrument family, then by actual lifecycle
  // status. Each instrument is labelled from its own record, so a protocol
  // investment never colours an asset instrument and vice versa.
  const groups = protocols
    .map((protocol) => {
      const owned = instruments.filter(
        (item) => item.assetProtocolId === protocol.id,
      );
      return {
        protocol,
        families: [
          {
            key: "familyAssetToken",
            items: owned.filter((item) => item.instrumentType === "ASSET_TOKEN"),
          },
          {
            key: "familyProtocolInvestment",
            items: owned.filter(
              (item) => item.instrumentType === "PROTOCOL_INVESTMENT",
            ),
          },
        ].filter((family) => family.items.length > 0),
      };
    })
    // A protocol with no instruments is omitted, never padded with demo rows.
    .filter((group) => group.families.length > 0);

  function statusLabel(item: MarketInstrument): string {
    return item.status === "ISSUED"
      ? t("issuedDemonstratorInstrument")
      : lookupMessage(t, `status${item.status}`);
  }

  function hintFor(item: MarketInstrument): string {
    if (item.status === "ISSUED") {
      return item.name;
    }
    return `${item.name} · ${t("notIssuedNote")}`;
  }

  return (
    <div>
      <MarketCoreContextHeader
        level="INSTRUMENT"
        trail={platformTrail()}
        title={t("instrumentsTitle")}
        description={t("instrumentsIntro")}
        translate={t}
        photo="/media/grain-kernel-macro.png"
      />

      {groups.map(({ protocol, families }) => (
        <PageSection
          key={protocol.id}
          title={protocol.name}
          description={lookupMessage(t, ASSET_CLASS_KEYS[protocol.assetClass])}
        >
          {families.map((family) => (
            <div key={family.key} className="mb-6 last:mb-0">
              <p className="label-caps text-harvest">{lookupMessage(t, family.key)}</p>
              <DeskLedger className="mt-3">
                {family.items.map((item, index) => (
                  <DeskRow
                    key={item.id}
                    href={instrumentHref(item.id)}
                    index={deskIndex(index)}
                    title={
                      item.instrumentType === "PROTOCOL_INVESTMENT"
                        ? item.name
                        : item.symbol
                    }
                    hint={hintFor(item)}
                    value={
                      <MarketStatusChip label={statusLabel(item)} tone={item.status} />
                    }
                  />
                ))}
              </DeskLedger>
              <dl className="mt-3 space-y-1 text-xs text-straw">
                {family.items.map((item) => {
                  const versionHref = boundProtocolVersionHref(item);
                  return (
                    <div key={item.id} className="flex flex-wrap gap-2">
                      <dt>{item.symbol}</dt>
                      <dd>
                        {versionHref && item.protocolVersionId ? (
                          <Link
                            href={versionHref}
                            className="text-primary hover:underline"
                          >
                            {item.protocolVersionId}
                          </Link>
                        ) : (
                          t("instrumentsWithoutVersion")
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </PageSection>
      ))}

      <DeskNote className="mt-8">{t("protocolInvestmentNote")}</DeskNote>
      <p className="mt-4 text-xs text-straw">{t("noFakeEconomics")}</p>
    </div>
  );
}
