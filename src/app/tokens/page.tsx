import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { IssueTokenButton } from "@/components/tokens/issue-token-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataList } from "@/components/shared/data-list";
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

      <Card className="shadow-none">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs text-muted-foreground">{token.id}</p>
              <CardTitle className="mt-1">{token.symbol}</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge value={token.blockchainStatus} />
              <IssueTokenButton />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DataList
            items={[
              {
                label: t("fields.type"),
                value: lookupMessage(tCatalog, `tokenType.${token.id}`),
              },
              { label: t("fields.issuer"), value: token.issuerName },
              {
                label: t("fields.tokenUnit"),
                value: lookupMessage(tCatalog, `tokenUnit.${token.id}`),
              },
              { label: t("fields.contractPool"), value: pool.id },
              {
                label: t("fields.maximumIssuance"),
                value: formatInteger(token.maximumIssuance, locale),
              },
              {
                label: t("fields.issued"),
                value: formatInteger(token.issued, locale),
              },
              { label: t("fields.network"), value: token.network },
              {
                label: t("fields.blockchainStatus"),
                value: tStatus(token.blockchainStatus),
              },
            ]}
          />
          <p className="mt-6 text-sm">
            {t("underlyingPool")}:{" "}
            <Link
              href={`/pools/${pool.id}`}
              className="font-medium text-primary hover:underline"
            >
              {lookupMessage(tCatalog, `pools.${pool.id}`)}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
