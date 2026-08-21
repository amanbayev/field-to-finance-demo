import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  PROGRAM_NAME,
  explorerAddressUrl,
  explorerTxUrl,
  shortenKey,
  type OnChainContractLookup,
} from "@/adapters/blockchain";
import { DataList } from "@/components/shared/data-list";
import { PageSection } from "@/components/shared/page-section";
import { Panel, PanelBody } from "@/components/shared/panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatInteger, formatLedgerTimestamp } from "@/lib/format";
import type { AppLocale } from "@/i18n/config";

function onChainStatusValue(
  status: NonNullable<OnChainContractLookup["contract"]>["status"],
): string {
  switch (status) {
    case "PendingVerification":
      return "PENDING_VERIFICATION";
    case "Verified":
      return "VERIFIED";
    case "Suspended":
      return "SUSPENDED";
  }
}

export async function OnChainProofPanel({
  lookup,
  locale,
}: {
  lookup: OnChainContractLookup;
  locale: AppLocale;
}) {
  const t = await getTranslations("contracts");
  const tUnits = await getTranslations("units");

  if (lookup.status === "unavailable") {
    return (
      <PageSection
        title={t("sections.onChainProof")}
        description={t("onChainProofIntro")}
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

  if (lookup.status === "missing" || !lookup.contract) {
    return (
      <PageSection
        title={t("sections.onChainProof")}
        description={t("onChainProofIntro")}
      >
        <Panel>
          <PanelBody className="space-y-3">
            <StatusBadge value="OFF_CHAIN" />
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("onChainOffchainOnly")}
            </p>
          </PanelBody>
        </Panel>
      </PageSection>
    );
  }

  const contract = lookup.contract;
  const createdIso = new Date(contract.createdAt * 1000).toISOString();
  const updatedIso = new Date(contract.updatedAt * 1000).toISOString();

  return (
    <PageSection
      title={t("sections.onChainProof")}
      description={t("onChainProofIntro")}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <StatusBadge
          value={
            contract.status === "Verified" ? "VERIFIED_ON_CHAIN" : "ON_CHAIN"
          }
        />
        <p className="text-xs text-muted-foreground">{t("onChainNotBusinessRecord")}</p>
      </div>
      <DataList
        items={[
          { label: t("proof.network"), value: "Solana Devnet" },
          {
            label: t("proof.blockchainStatus"),
            value: (
              <StatusBadge
                value={
                  contract.status === "Verified"
                    ? "VERIFIED_ON_CHAIN"
                    : onChainStatusValue(contract.status)
                }
              />
            ),
          },
          { label: t("proof.program"), value: PROGRAM_NAME },
          {
            label: t("proof.programId"),
            value: (
              <ExplorerLink href={explorerAddressUrl(contract.programId)} full>
                {contract.programId}
              </ExplorerLink>
            ),
          },
          {
            label: t("proof.pda"),
            value: (
              <ExplorerLink href={explorerAddressUrl(contract.pda)} full>
                {contract.pda}
              </ExplorerLink>
            ),
          },
          {
            label: t("proof.onChainStatus"),
            value: <StatusBadge value={onChainStatusValue(contract.status)} />,
          },
          {
            label: t("proof.producerReference"),
            value: (
              <span className="font-tabular text-xs">
                {contract.producerReference}
              </span>
            ),
          },
          { label: t("fields.crop"), value: contract.crop },
          { label: t("fields.season"), value: String(contract.season) },
          {
            label: t("fields.fieldArea"),
            value: tUnits("hectaresShort", {
              value: formatInteger(contract.fieldAreaHectares, locale),
            }),
          },
          {
            label: t("fields.expectedProduction"),
            value: tUnits("tonnes", {
              value: formatInteger(contract.expectedVolumeTonnes, locale),
            }),
          },
          { label: t("fields.quality"), value: contract.qualityClass },
          { label: t("fields.region"), value: contract.region },
          {
            label: t("proof.created"),
            value: `${formatLedgerTimestamp(createdIso, locale)} UTC`,
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
            label: t("proof.verifyTx"),
            value: lookup.verifySignature ? (
              <ExplorerLink href={explorerTxUrl(lookup.verifySignature)}>
                {lookup.verifySignature}
              </ExplorerLink>
            ) : (
              t("proof.notRecorded")
            ),
          },
        ]}
      />
      <div className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
        <Link
          href={explorerAddressUrl(contract.programId)}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          {t("proof.viewProgram")}
        </Link>
        <Link
          href={explorerAddressUrl(contract.pda)}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          {t("proof.viewContract")}
        </Link>
        {lookup.createSignature ? (
          <Link
            href={explorerTxUrl(lookup.createSignature)}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            {t("proof.viewCreateTx")}
          </Link>
        ) : null}
        {lookup.verifySignature ? (
          <Link
            href={explorerTxUrl(lookup.verifySignature)}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            {t("proof.viewVerifyTx")}
          </Link>
        ) : null}
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
