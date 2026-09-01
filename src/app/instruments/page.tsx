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
  instrumentsTrail,
} from "@/lib/market-core/hierarchy";
import { groupInstrumentCatalogue } from "@/lib/market-core/instrument-catalogue";
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
  // Same production helper the catalogue tests exercise.
  const groups = groupInstrumentCatalogue(listAssetProtocols(), listMarketInstruments());

  function statusLabel(item: MarketInstrument): string {
    return item.status === "ISSUED"
      ? t("issuedDemonstratorInstrument")
      : lookupMessage(t, `status${item.status}`);
  }

  return (
    <div>
      <MarketCoreContextHeader
        level="INSTRUMENT"
        trail={instrumentsTrail()}
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
            <div key={family.instrumentType} className="mb-8 last:mb-0">
              <p className="label-caps text-harvest">
                {lookupMessage(t, family.labelKey)}
              </p>
              {family.statuses.map((group) => (
                <div key={group.status} className="mt-4">
                  <p className="text-xs text-straw">
                    {group.status === "ISSUED"
                      ? t("issuedDemonstratorInstrument")
                      : `${lookupMessage(t, `status${group.status}`)} · ${t("notIssuedNote")}`}
                  </p>
                  <DeskLedger className="mt-2">
                    {group.instruments.map((item, index) => (
                      <DeskRow
                        key={item.id}
                        href={instrumentHref(item.id)}
                        index={deskIndex(index)}
                        title={
                          item.instrumentType === "PROTOCOL_INVESTMENT"
                            ? item.name
                            : item.symbol
                        }
                        hint={item.name}
                        value={
                          <MarketStatusChip label={statusLabel(item)} tone={item.status} />
                        }
                      />
                    ))}
                  </DeskLedger>
                  <dl className="mt-2 space-y-1 text-xs text-straw">
                    {group.instruments.map((item) => {
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
            </div>
          ))}
        </PageSection>
      ))}

      <DeskNote className="mt-8">{t("protocolInvestmentNote")}</DeskNote>
      <p className="mt-4 text-xs text-straw">{t("noFakeEconomics")}</p>
    </div>
  );
}
