import { getTranslations } from "next-intl/server";
import {
  TOKEN_2022_PROGRAM_ID,
  explorerAddressUrl,
  explorerTxUrl,
  type OnChainTokenMintLookup,
} from "@/adapters/blockchain";
import { IssueTokenButton } from "@/components/tokens/issue-token-button";
import { DataList } from "@/components/shared/data-list";
import { PageSection } from "@/components/shared/page-section";
import { Panel, PanelBody } from "@/components/shared/panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatInteger } from "@/lib/format";
import type { AppLocale } from "@/i18n/config";

export async function TokenMintProofPanel({
  lookup,
  locale,
}: {
  lookup: OnChainTokenMintLookup;
  locale: AppLocale;
}) {
  const t = await getTranslations("tokens");

  if (lookup.status === "unavailable") {
    return (
      <PageSection
        title={t("mintProof.title")}
        description={t("mintProof.intro")}
      >
        <Panel>
          <PanelBody className="space-y-3">
            <StatusBadge value="PROOF_UNAVAILABLE" />
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("mintProof.unavailable")}
            </p>
            <IssueTokenButton />
          </PanelBody>
        </Panel>
      </PageSection>
    );
  }

  if (lookup.status === "missing" || !lookup.mint) {
    return (
      <PageSection
        title={t("mintProof.title")}
        description={t("mintProof.intro")}
      >
        <Panel>
          <PanelBody className="space-y-3">
            <StatusBadge value="NOT_YET_DEPLOYED" />
            <p className="max-w-2xl text-sm text-muted-foreground">
              {t("notDeployedNote")}
            </p>
            <p className="text-xs text-muted-foreground">{t("issueNote")}</p>
            <IssueTokenButton />
          </PanelBody>
        </Panel>
      </PageSection>
    );
  }

  const mint = lookup.mint;

  return (
    <PageSection
      title={t("mintProof.title")}
      description={t("mintProof.foundIntro")}
    >
      <Panel>
        <PanelBody className="space-y-4">
          <DataList
            items={[
              {
                label: t("fields.blockchainStatus"),
                value: <StatusBadge value="DEPLOYED" />,
              },
              {
                label: t("fields.issued"),
                value: t("issuanceNotStarted"),
              },
              {
                label: t("mintProof.program"),
                value: (
                  <ExplorerLink href={explorerAddressUrl(TOKEN_2022_PROGRAM_ID)}>
                    {TOKEN_2022_PROGRAM_ID}
                  </ExplorerLink>
                ),
              },
              {
                label: t("fields.mint"),
                value: (
                  <ExplorerLink href={explorerAddressUrl(mint.mint)}>
                    {mint.mint}
                  </ExplorerLink>
                ),
              },
              {
                label: t("mintProof.decimals"),
                value: formatInteger(mint.decimals, locale),
              },
              {
                label: t("mintProof.supply"),
                value: formatInteger(mint.supply, locale),
              },
              {
                label: t("mintProof.mintAuthority"),
                value: mint.mintAuthority ? (
                  <ExplorerLink href={explorerAddressUrl(mint.mintAuthority)}>
                    {mint.mintAuthority}
                  </ExplorerLink>
                ) : (
                  t("notRecorded")
                ),
              },
              {
                label: t("mintProof.createTx"),
                value: lookup.createSignature ? (
                  <ExplorerLink href={explorerTxUrl(lookup.createSignature)}>
                    {lookup.createSignature}
                  </ExplorerLink>
                ) : (
                  t("notRecorded")
                ),
              },
            ]}
          />
          <p className="text-xs text-muted-foreground">{t("issueNote")}</p>
          <IssueTokenButton />
        </PanelBody>
      </Panel>
    </PageSection>
  );
}

function ExplorerLink({
  href,
  children,
}: {
  href: string;
  children: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all font-tabular text-xs text-primary hover:underline"
      title={children}
    >
      {children}
    </a>
  );
}
