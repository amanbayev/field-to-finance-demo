import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ON_CHAIN_DEMO_POOL_ID,
  explorerAddressUrl,
  explorerTxUrl,
  type OnChainAllocationLookup,
} from "@/adapters/blockchain";
import { DataList } from "@/components/shared/data-list";
import { PageSection } from "@/components/shared/page-section";
import { Panel, PanelBody } from "@/components/shared/panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatInteger } from "@/lib/format";
import type { AppLocale } from "@/i18n/config";

export async function PoolAllocationPanel({
  lookup,
  locale,
  expectedVolumeTonnes,
}: {
  lookup: OnChainAllocationLookup;
  locale: AppLocale;
  expectedVolumeTonnes: number;
}) {
  const t = await getTranslations("contracts");
  const tUnits = await getTranslations("units");

  if (lookup.status === "unavailable") {
    return (
      <PageSection
        title={t("sections.poolAllocation")}
        description={t("allocation.intro")}
      >
        <Panel>
          <PanelBody className="space-y-3">
            <StatusBadge value="PROOF_UNAVAILABLE" />
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("onChainUnavailable")}
            </p>
          </PanelBody>
        </Panel>
      </PageSection>
    );
  }

  const allocated =
    lookup.allocation?.allocatedVolumeTonnes ??
    lookup.index?.allocatedVolumeTonnes ??
    0;
  const remaining =
    lookup.remainingVolumeTonnes ?? Math.max(0, expectedVolumeTonnes - allocated);
  const onChain = Boolean(lookup.allocation);

  return (
    <PageSection
      title={t("sections.poolAllocation")}
      description={t("allocation.intro")}
    >
      <DataList
        items={[
          {
            label: t("allocation.pool"),
            value: (
              <Link
                href={`/pools/${ON_CHAIN_DEMO_POOL_ID}`}
                className="font-tabular text-xs text-primary hover:underline"
              >
                {lookup.allocation?.poolId ?? ON_CHAIN_DEMO_POOL_ID}
              </Link>
            ),
          },
          {
            label: t("allocation.allocated"),
            value: tUnits("tonnes", {
              value: formatInteger(allocated, locale),
            }),
          },
          {
            label: t("allocation.remaining"),
            value: tUnits("tonnes", {
              value: formatInteger(remaining, locale),
            }),
          },
          {
            label: t("allocation.proof"),
            value: onChain ? (
              <StatusBadge value="ON_CHAIN" />
            ) : (
              <StatusBadge value="OFF_CHAIN" />
            ),
          },
          {
            label: t("allocation.pda"),
            value: lookup.allocation ? (
              <a
                href={explorerAddressUrl(lookup.allocation.pda)}
                target="_blank"
                rel="noreferrer"
                className="break-all font-tabular text-xs text-primary hover:underline"
              >
                {lookup.allocation.pda}
              </a>
            ) : (
              t("proof.notRecorded")
            ),
          },
          {
            label: t("allocation.tx"),
            value: lookup.allocateSignature ? (
              <a
                href={explorerTxUrl(lookup.allocateSignature)}
                target="_blank"
                rel="noreferrer"
                className="font-tabular text-xs text-primary hover:underline"
              >
                {lookup.allocateSignature}
              </a>
            ) : (
              t("proof.notRecorded")
            ),
          },
        ]}
      />
    </PageSection>
  );
}
