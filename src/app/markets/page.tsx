import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/page-section";
import {
  DeskFigure,
  DeskLedger,
  DeskNote,
  DeskRow,
  deskIndex,
} from "@/components/surface/desk-stage";
import { lookupMessage } from "@/i18n/t-dynamic";
import { requirePermission } from "@/lib/auth/guard";
import { ASSET_CLASS_KEYS, protocolStatusKey } from "@/lib/market-core/presentation";
import {
  getProtocolContext,
  listAssetProtocols,
} from "@/services/market-core-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("marketsTitle") };
}

export default async function MarketsPage() {
  await requirePermission("market.read", "regulator.read");
  const t = await getTranslations("marketCore");
  const tDesk = await getTranslations("desk");
  const protocols = listAssetProtocols();
  const issued = protocols.flatMap((protocol) => {
    const context = getProtocolContext(protocol.id);
    return (
      context?.instruments.filter(
        (item) => item.instrumentType === "ASSET_TOKEN" && item.status === "ISSUED",
      ) ?? []
    );
  });

  return (
    <div>
      <PageHeader
        eyebrow={t("levelPlatform")}
        title={t("marketsTitle")}
        description={t("marketsIntro")}
        photo="/media/hero-harvest-dusk.png"
        figure={
          <DeskFigure
            label={t("issuedInstruments")}
            value={issued[0]?.symbol ?? t("noIssuedInstruments")}
            meta={[
              {
                label: t("levelProtocol"),
                value: String(protocols.length),
              },
              {
                label: t("protocolStatus"),
                value: protocols[0]
                  ? lookupMessage(t, protocolStatusKey(protocols[0].status))
                  : "—",
              },
            ]}
          />
        }
      />

      {protocols.length === 0 ? (
        <EmptyState
          kicker={t("marketsTitle")}
          title={tDesk("noneOnBook")}
          body={t("marketsIntro")}
        />
      ) : (
        <DeskLedger>
          {protocols.map((protocol, index) => {
            const context = getProtocolContext(protocol.id);
            const protocolIssued = context?.instruments.filter(
              (item) => item.instrumentType === "ASSET_TOKEN" && item.status === "ISSUED",
            );
            const symbol = protocolIssued?.[0]?.symbol;
            return (
              <DeskRow
                key={protocol.id}
                href={`/protocols/${protocol.id}`}
                index={deskIndex(index)}
                kicker={lookupMessage(t, ASSET_CLASS_KEYS[protocol.assetClass])}
                title={protocol.name}
                value={symbol ?? lookupMessage(t, protocolStatusKey(protocol.status))}
                hint={
                  symbol
                    ? t("issuedDemonstratorInstrument")
                    : (context?.currentVersion?.rules.verificationModel ??
                      t("noActiveProtocolVersion"))
                }
              />
            );
          })}
        </DeskLedger>
      )}

      <div className="mt-10">
        <DeskNote>{t("platformNotToken")}</DeskNote>
        <DeskLedger className="mt-6">
          <DeskRow
            index={deskIndex(0)}
            kicker={t("levelPlatform")}
            title={t("platformNotToken")}
          />
          <DeskRow
            index={deskIndex(1)}
            kicker={t("levelProtocol")}
            title={t("notInstrument")}
          />
          <DeskRow
            index={deskIndex(2)}
            kicker={t("levelInstrument")}
            title={t("notProtocol")}
          />
          <DeskRow href="/architecture" index={deskIndex(3)} title={t("architectureCta")} />
        </DeskLedger>
      </div>
    </div>
  );
}
