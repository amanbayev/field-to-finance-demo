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
import {
  ASSET_CLASS_KEYS,
  PROTOCOL_VERSION_STATE_KEYS,
  protocolStatusKey,
} from "@/lib/market-core/presentation";
import { listProtocolVersionSummaries } from "@/services/market-core-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("protocolsTitle") };
}

export default async function ProtocolsPage() {
  await requirePermission("market.read", "regulator.read");
  const t = await getTranslations("marketCore");
  const protocols = listProtocolVersionSummaries();

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
          {protocols.map(({ protocol, versions }, index) => (
            <DeskRow
              key={protocol.id}
              href={protocolHref(protocol.id)}
              index={deskIndex(index)}
              kicker={lookupMessage(t, ASSET_CLASS_KEYS[protocol.assetClass])}
              title={protocol.name}
              hint={
                versions.length > 0
                  ? `${t("recordedVersions")}: ${versions.map((v) => v.id).join(", ")}`
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

      <PageSection title={t("recordedVersions")}>
        <DeskNote className="mb-4">{t("protocolVersionIntro")}</DeskNote>
        {protocols.map(({ protocol, versions, currentVersion }) => (
          <div key={protocol.id} className="mb-6 last:mb-0">
            <p className="label-caps text-harvest">{protocol.name}</p>
            {versions.length > 0 ? (
              <>
                <DeskLedger className="mt-3">
                  {versions.map((version, index) => (
                    <DeskRow
                      key={version.id}
                      href={protocolVersionHref(protocol.id, version.id)}
                      index={deskIndex(index)}
                      title={version.id}
                      hint={`${t("protocolVersionDisplay")} ${version.displayVersion}`}
                      value={
                        <span className="flex flex-wrap gap-3">
                          <MarketStatusChip
                            label={lookupMessage(
                              t,
                              PROTOCOL_VERSION_STATE_KEYS[version.state],
                            )}
                            tone={version.state === "ACTIVE" ? "ACTIVE" : "STRUCTURING"}
                          />
                          <MarketStatusChip
                            label={
                              version.frozen ? t("immutableRules") : t("rulesNotFrozen")
                            }
                            tone={version.frozen ? "ACTIVE" : "FUTURE"}
                          />
                        </span>
                      }
                    />
                  ))}
                </DeskLedger>
                <p className="mt-2 text-xs text-straw">
                  {t("currentUsableVersion")}:{" "}
                  {currentVersion ? currentVersion.id : t("noCurrentUsableVersion")}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-straw">{t("noRecordedVersion")}</p>
            )}
          </div>
        ))}
      </PageSection>

      <p className="mt-6 text-xs text-straw">{t("noFakeEconomics")}</p>
    </div>
  );
}
