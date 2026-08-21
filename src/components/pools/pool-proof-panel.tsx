import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  PROGRAM_NAME,
  explorerAddressUrl,
  explorerTxUrl,
  shortenKey,
  type OnChainCoverageProofLookup,
  type OnChainPoolLookup,
} from "@/adapters/blockchain";
import { DataList } from "@/components/shared/data-list";
import { PageSection } from "@/components/shared/page-section";
import { Panel, PanelBody } from "@/components/shared/panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatInteger, formatLedgerTimestamp, formatPercent } from "@/lib/format";
import type { AppLocale } from "@/i18n/config";

function poolStatusValue(status: string): string {
  switch (status) {
    case "Draft":
      return "DRAFT";
    case "Active":
      return "ACTIVE";
    case "Suspended":
      return "SUSPENDED";
    case "Closed":
      return "CLOSED";
    default:
      return status;
  }
}

export async function PoolProofPanel({
  lookup,
  coverage,
  locale,
}: {
  lookup: OnChainPoolLookup;
  coverage: OnChainCoverageProofLookup;
  locale: AppLocale;
}) {
  const t = await getTranslations("pools");
  const tUnits = await getTranslations("units");

  if (lookup.status === "unavailable") {
    return (
      <PageSection
        title={t("proof.title")}
        description={t("proof.intro")}
      >
        <Panel>
          <PanelBody className="space-y-3">
            <StatusBadge value="PROOF_UNAVAILABLE" />
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("proof.unavailable")}
            </p>
          </PanelBody>
        </Panel>
      </PageSection>
    );
  }

  if (lookup.status === "missing" || !lookup.pool) {
    return (
      <PageSection
        title={t("proof.title")}
        description={t("proof.intro")}
      >
        <Panel>
          <PanelBody className="space-y-3">
            <StatusBadge value="OFF_CHAIN" />
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("proof.missing")}
            </p>
          </PanelBody>
        </Panel>
      </PageSection>
    );
  }

  const pool = lookup.pool;
  const updatedIso = new Date(pool.updatedAt * 1000).toISOString();
  const haircutPercent = pool.coverageHaircutBps / 100;

  return (
    <PageSection title={t("proof.title")} description={t("proof.intro")}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <StatusBadge value="ON_CHAIN" />
        <p className="text-xs text-muted-foreground">{t("proof.hybridNote")}</p>
      </div>
      <DataList
        items={[
          { label: t("proof.network"), value: "Solana Devnet" },
          { label: t("proof.program"), value: PROGRAM_NAME },
          {
            label: t("proof.programId"),
            value: (
              <ExplorerLink href={explorerAddressUrl(pool.programId)} full>
                {pool.programId}
              </ExplorerLink>
            ),
          },
          {
            label: t("proof.pda"),
            value: (
              <ExplorerLink href={explorerAddressUrl(pool.pda)} full>
                {pool.pda}
              </ExplorerLink>
            ),
          },
          {
            label: t("proof.status"),
            value: <StatusBadge value={poolStatusValue(pool.status)} />,
          },
          {
            label: t("proof.contractCount"),
            value: formatInteger(pool.contractCount, locale),
          },
          {
            label: t("proof.gross"),
            value: tUnits("tonnes", {
              value: formatInteger(pool.grossVolumeTonnes, locale),
            }),
          },
          {
            label: t("proof.eligible"),
            value: tUnits("tonnes", {
              value: formatInteger(pool.eligibleVolumeTonnes, locale),
            }),
          },
          {
            label: t("proof.haircut"),
            value: formatPercent(haircutPercent, locale),
          },
          {
            label: t("proof.snapshotHash"),
            value: coverage.snapshotAnchored ? (
              <span className="break-all font-tabular text-xs">
                {pool.coverageSnapshotHashHex}
              </span>
            ) : (
              t("proof.notRecorded")
            ),
          },
          {
            label: t("proof.coverageModel"),
            value: t("proof.coverageModelValue"),
          },
          {
            label: t("proof.coverageSnapshot"),
            value: coverage.snapshotAnchored
              ? t("proof.coverageSnapshotValue")
              : t("proof.notRecorded"),
          },
          {
            label: t("proof.updated"),
            value: `${formatLedgerTimestamp(updatedIso, locale)} UTC`,
          },
          {
            label: t("proof.createTx"),
            value: lookup.createSignature ? (
              <ExplorerLink href={explorerTxUrl(lookup.createSignature)}>
                {lookup.createSignature}
              </ExplorerLink>
            ) : (
              t("proof.notRecorded")
            ),
          },
          {
            label: t("proof.coverageTx"),
            value: lookup.coverageSignature ? (
              <ExplorerLink href={explorerTxUrl(lookup.coverageSignature)}>
                {lookup.coverageSignature}
              </ExplorerLink>
            ) : (
              t("proof.notRecorded")
            ),
          },
        ]}
      />
      <div className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
        <Link
          href={explorerAddressUrl(pool.pda)}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          {t("proof.viewPool")}
        </Link>
      </div>
    </PageSection>
  );
}

function ExplorerLink({
  href,
  children,
  full = false,
}: {
  href: string;
  children: string;
  full?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all font-tabular text-xs text-primary hover:underline"
      title={children}
    >
      {full ? children : shortenKey(children, 6)}
    </a>
  );
}
