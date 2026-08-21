import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { DataList } from "@/components/shared/data-list";
import { FactStrip } from "@/components/shared/fact-strip";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { Panel, PanelBody, PanelHeader } from "@/components/shared/panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { IssueTokenButton } from "@/components/tokens/issue-token-button";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { getPrimaryToken } from "@/services/token-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tokens");
  return { title: t("title") };
}

export default async function TokensPage() {
  const t = await getTranslations("tokens");
  const tCatalog = await getTranslations("catalog");
  const tStatus = await getTranslations("status");
  const locale = (await getLocale()) as AppLocale;
  const { token, pool } = getPrimaryToken();

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={token.symbol}
        description={t("description")}
      />

      <FactStrip
        className="mb-6"
        items={[
          { label: t("fields.instrument"), value: token.symbol },
          { label: t("fields.issuer"), value: token.issuerName },
          {
            label: t("fields.contractPool"),
            value: (
              <Link
                href={`/pools/${pool.id}`}
                className="font-tabular text-xs text-primary hover:underline"
              >
                {pool.id}
              </Link>
            ),
          },
            {
              label: t("fields.issued"),
              value: t("issuanceNotStarted"),
            },
          {
            label: t("fields.maximumIssuance"),
            value: formatInteger(token.maximumIssuance, locale),
          },
          {
            label: t("fields.blockchainStatus"),
            value: <StatusBadge value={token.blockchainStatus} />,
          },
        ]}
      />

      <DataList
        items={[
          {
            label: t("fields.type"),
            value: lookupMessage(tCatalog, `tokenType.${token.id}`),
          },
          {
            label: t("fields.tokenUnit"),
            value: lookupMessage(tCatalog, `tokenUnit.${token.id}`),
          },
          {
            label: t("underlyingPool"),
            value: (
              <Link
                href={`/pools/${pool.id}`}
                className="text-primary hover:underline"
              >
                {lookupMessage(tCatalog, `pools.${pool.id}`)}
              </Link>
            ),
          },
          {
            label: t("fields.maturity"),
            value: tStatus("NOT_APPLICABLE"),
          },
          { label: t("fields.network"), value: token.network },
        ]}
      />

      <PageSection
        title={t("onChainReserved")}
        description={t("notDeployedNote")}
      >
        <Panel>
          <PanelHeader title={t("fields.txHistory")} />
          <PanelBody>
            <DataList
              items={[
                {
                  label: t("fields.programId"),
                  value: t("notRecorded"),
                },
                { label: t("fields.mint"), value: t("notRecorded") },
                {
                  label: t("fields.txHistory"),
                  value: t("notRecorded"),
                },
              ]}
            />
            <p className="mt-4 text-xs text-muted-foreground">{t("issueNote")}</p>
            <div className="mt-3">
              <IssueTokenButton />
            </div>
          </PanelBody>
        </Panel>
      </PageSection>
    </div>
  );
}
