import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MarketCoreContextHeader } from "@/components/market-core/market-core-context-header";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { DataList } from "@/components/shared/data-list";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { DeskLedger, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { lookupMessage } from "@/i18n/t-dynamic";
import { requirePermission } from "@/lib/auth/guard";
import { instrumentHref, protocolVersionTrail } from "@/lib/market-core/hierarchy";
import {
  ASSET_CLASS_KEYS,
  PROTOCOL_VERSION_STATE_KEYS,
  protocolVersionGovernanceKey,
} from "@/lib/market-core/presentation";
import {
  getProtocolVersionContext,
  listProtocolVersions,
} from "@/services/market-core-service";

/**
 * The version registry is finite and known at build time, so unknown protocol or
 * version parameters are rejected at routing time. This is required for a real
 * 404: with a streamed shell, a `notFound()` raised inside the component runs
 * after the response headers are committed and the status stays 200. The sibling
 * `/protocols/[protocolId]` and `/instruments/[instrumentId]` routes do the same.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return listProtocolVersions().map((version) => ({
    protocolId: version.protocolId,
    versionId: version.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ protocolId: string; versionId: string }>;
}): Promise<Metadata> {
  const { versionId } = await params;
  return { title: versionId };
}

export default async function ProtocolVersionPage({
  params,
}: {
  params: Promise<{ protocolId: string; versionId: string }>;
}) {
  const { protocolId, versionId } = await params;
  await requirePermission("market.read", "regulator.read");
  // Null for an unknown protocol, an unknown version, or a protocol/version
  // mismatch. No protocol- or asset-specific branch anywhere on this route.
  const context = getProtocolVersionContext(protocolId, versionId);
  if (!context) {
    notFound();
  }
  const t = await getTranslations("marketCore");
  const { protocol, version, boundInstruments } = context;
  const { rules } = version;

  return (
    <div>
      <MarketCoreContextHeader
        level="PROTOCOL_VERSION"
        trail={protocolVersionTrail(protocol, version)}
        title={version.id}
        description={t("protocolVersionIntro")}
        translate={t}
      />

      <div className="mb-6 flex flex-wrap gap-3">
        <MarketStatusChip
          label={lookupMessage(t, PROTOCOL_VERSION_STATE_KEYS[version.state])}
          tone={version.state === "ACTIVE" ? "ACTIVE" : "STRUCTURING"}
        />
        {version.frozen ? (
          <MarketStatusChip label={t("immutableRules")} tone="ACTIVE" />
        ) : null}
        <span className="text-xs text-muted-foreground">{t("demonstratorOnly")}</span>
      </div>

      <DataList
        items={[
          { label: t("levelProtocol"), value: protocol.name },
          {
            label: t("assetClass"),
            value: lookupMessage(t, ASSET_CLASS_KEYS[protocol.assetClass]),
          },
          { label: t("protocolVersionId"), value: version.id },
          { label: t("protocolVersionDisplay"), value: version.displayVersion },
          {
            label: t("protocolVersionState"),
            value: lookupMessage(t, PROTOCOL_VERSION_STATE_KEYS[version.state]),
          },
          {
            label: t("protocolVersionActivated"),
            value: version.activatedAt ?? t("dateNotClaimed"),
          },
          {
            label: t("protocolVersionFrozenAt"),
            value: version.frozenAt ?? t("dateNotClaimed"),
          },
        ]}
      />

      <PageSection title={t("protocolRules")}>
        <DataList
          items={[
            { label: t("verification"), value: rules.verificationModel },
            { label: t("riskModel"), value: rules.riskModel },
            { label: t("coverageModel"), value: rules.coverageModel },
            { label: t("issuanceModel"), value: rules.issuanceModel },
            { label: t("redemptionModel"), value: rules.redemptionModel },
          ]}
        />
      </PageSection>

      <PageSection title={t("protocolVersionGovernance")}>
        <p className="text-sm leading-relaxed text-straw">
          {lookupMessage(t, protocolVersionGovernanceKey(version.id))}
        </p>
        <DataList
          items={[
            {
              label: t("versionSupersedes"),
              value: version.supersedesVersionId ?? t("versionNoSupersession"),
            },
            {
              label: t("versionSupersededBy"),
              value: version.supersededByVersionId ?? t("versionNoSupersession"),
            },
          ]}
        />
      </PageSection>

      <PageSection title={t("boundInstruments")} description={t("boundAtIssuance")}>
        {boundInstruments.length > 0 ? (
          <DeskLedger>
            {boundInstruments.map((instrument, index) => (
              <DeskRow
                key={instrument.id}
                href={instrumentHref(instrument.id)}
                index={deskIndex(index)}
                title={instrument.symbol}
                hint={instrument.name}
                value={
                  <MarketStatusChip
                    label={lookupMessage(t, `status${instrument.status}`)}
                    tone={instrument.status}
                  />
                }
              />
            ))}
          </DeskLedger>
        ) : (
          <EmptyState>{t("noBoundInstruments")}</EmptyState>
        )}
      </PageSection>

      <p className="mt-6 text-xs text-straw">
        <Link href={`/protocols/${protocol.id}`} className="text-primary hover:underline">
          {protocol.name}
        </Link>
      </p>
    </div>
  );
}
