import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MarketCoreContextHeader } from "@/components/market-core/market-core-context-header";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { PageSection } from "@/components/shared/page-section";
import { DeskLedger, DeskNote, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { lookupMessage } from "@/i18n/t-dynamic";
import { requirePermission } from "@/lib/auth/guard";
import {
  protocolHref,
  protocolVersionHref,
  protocolsTrail,
} from "@/lib/market-core/hierarchy";
import { ASSET_CLASS_KEYS, protocolStatusKey } from "@/lib/market-core/presentation";
import { listAssetProtocolsWithCurrentVersion } from "@/services/market-core-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("protocolsTitle") };
}

export default async function ProtocolsPage() {
  await requirePermission("market.read", "regulator.read");
  const t = await getTranslations("marketCore");
  const protocols = listAssetProtocolsWithCurrentVersion();

  return (
    <div>
      <MarketCoreContextHeader
        level="PROTOCOL"
        trail={protocolsTrail()}
        title={t("protocolsTitle")}
        description={t("protocolsIntro")}
        translate={t}
      />

      <PageSection title={t("catalogueByProtocol")}>
        <DeskLedger>
          {protocols.map(({ protocol, currentVersion }, index) => (
            <DeskRow
              key={protocol.id}
              href={protocolHref(protocol.id)}
              index={deskIndex(index)}
              kicker={lookupMessage(t, ASSET_CLASS_KEYS[protocol.assetClass])}
              title={protocol.name}
              hint={
                currentVersion
                  ? `${t("recordedVersion")}: ${currentVersion.id}`
                  : t("noRecordedVersion")
              }
              value={
                <MarketStatusChip
                  label={lookupMessage(t, protocolStatusKey(protocol.status))}
                  tone={protocol.status}
                />
              }
            />
          ))}
        </DeskLedger>
      </PageSection>

      <PageSection title={t("protocolVersionPageTitle")}>
        <DeskNote className="mb-4">{t("protocolVersionIntro")}</DeskNote>
        <DeskLedger>
          {protocols.map(({ protocol, currentVersion }, index) =>
            currentVersion ? (
              <DeskRow
                key={protocol.id}
                href={protocolVersionHref(protocol.id, currentVersion.id)}
                index={deskIndex(index)}
                kicker={protocol.name}
                title={currentVersion.id}
                hint={`${t("protocolVersionDisplay")} ${currentVersion.displayVersion}`}
                value={
                  <MarketStatusChip
                    label={t("immutableRules")}
                    tone={currentVersion.frozen ? "ACTIVE" : "STRUCTURING"}
                  />
                }
              />
            ) : (
              <DeskRow
                key={protocol.id}
                index={deskIndex(index)}
                kicker={protocol.name}
                title={t("noRecordedVersion")}
                hint={lookupMessage(t, protocolStatusKey(protocol.status))}
              />
            ),
          )}
        </DeskLedger>
      </PageSection>

      <p className="mt-6 text-xs text-straw">{t("noFakeEconomics")}</p>
    </div>
  );
}
