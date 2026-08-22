import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DistributionDiagram } from "@/components/market-core/distribution-diagram";
import { LevelsPanel } from "@/components/market-core/levels-panel";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { PlatformOperatorStack } from "@/components/market-core/platform-operator-stack";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
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
  const protocols = listAssetProtocols();

  return (
    <div>
      <PageHeader
        eyebrow={t("levelPlatform")}
        title={t("marketsTitle")}
        description={t("marketsIntro")}
      />

      <PlatformOperatorStack />

      <div className="mt-8">
        <LevelsPanel
          title={t("levelsTitle")}
          levels={[
            { label: t("levelPlatform"), detail: t("platformNotToken") },
            { label: t("levelProtocol"), detail: t("notInstrument") },
            { label: t("levelInstrument"), detail: t("notProtocol") },
          ]}
        />
      </div>

      <PageSection title={t("marketsTitle")}>
        <div className="grid gap-4">
          {protocols.map((protocol) => {
            const context = getProtocolContext(protocol.id);
            const issued = context?.instruments.filter(
              (item) => item.instrumentType === "ASSET_TOKEN" && item.status === "ISSUED",
            );
            return (
              <article
                key={protocol.id}
                className="border border-border bg-card px-4 py-4"
              >
                <p className="label-caps text-muted-foreground">
                  {lookupMessage(t, ASSET_CLASS_KEYS[protocol.assetClass])}
                </p>
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-heading text-xl tracking-tight">{protocol.name}</h2>
                  <MarketStatusChip
                    label={lookupMessage(t, protocolStatusKey(protocol.status))}
                    tone={protocol.status}
                  />
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="label-caps text-muted-foreground">{t("protocolStatus")}</dt>
                    <dd>{lookupMessage(t, protocolStatusKey(protocol.status))}</dd>
                  </div>
                  <div>
                    <dt className="label-caps text-muted-foreground">{t("verification")}</dt>
                    <dd>{protocol.verificationModel}</dd>
                  </div>
                  <div>
                    <dt className="label-caps text-muted-foreground">{t("issuedInstruments")}</dt>
                    <dd>
                      {issued && issued.length > 0 ? (
                        issued.map((instrument) => (
                          <span key={instrument.id} className="block">
                            <Link
                              href={`/instruments/${instrument.id}`}
                              className="text-primary hover:underline"
                            >
                              {instrument.symbol}
                            </Link>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {t("issuedDemonstratorInstrument")}
                            </span>
                          </span>
                        ))
                      ) : (
                        t("noIssuedInstruments")
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3">
                  <Link
                    href={`/protocols/${protocol.id}`}
                    className="text-xs tracking-wide text-primary hover:underline"
                  >
                    {t("openProtocol")}
                  </Link>
                </p>
              </article>
            );
          })}
        </div>
      </PageSection>

      <PageSection title={t("architectureTitle")} description={t("architectureIntro")}>
        <DistributionDiagram
          title={t("architectureTitle")}
          coreLabel={t("marketCore")}
          channels={[t("channelDirect"), t("channelRetail"), t("channelApi")]}
          coreLayers={[
            t("coreAdmission"),
            t("coreOrders"),
            t("coreMatching"),
            t("coreClearing"),
            t("coreRegistry"),
            t("coreCompliance"),
            t("coreAudit"),
          ]}
          settlementLayers={[
            t("settleBank"),
            t("settleBinance"),
            t("settleStablecoin"),
            t("settleOther"),
          ]}
          notes={[t("noteBinance"), t("noteRetail"), t("noteNoSdk"), t("retailFuture")]}
        />
        <p className="mt-3">
          <Link href="/architecture" className="text-xs text-primary hover:underline">
            {t("architectureCta")}
          </Link>
        </p>
      </PageSection>
    </div>
  );
}
