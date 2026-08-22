import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { ON_CHAIN_DEMO_ISSUANCE_ID } from "@/adapters/blockchain";
import { requireRegistrarOrRegulator } from "@/lib/auth/guard";
import { getPlacementSnapshot } from "@/services/placement-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("issuanceRegistryTitle") };
}

export default async function IssuancesPage() {
  await requireRegistrarOrRegulator();
  const t = await getTranslations("workspace");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = await getPlacementSnapshot();

  return (
    <div>
      <PageHeader
        eyebrow={t("issuanceEyebrow")}
        title={t("issuanceRegistryTitle")}
        description={t("issuanceRegistryIntro")}
      />
      <p className="mb-4 text-xs text-muted-foreground">{t("issuanceRegistryNote")}</p>
      <PageSection title={t("issuanceRegistryTitle")}>
        {snapshot.supply.mintedSupply <= 0 ? (
          <EmptyState>{t("emptyIssuances")}</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("issuanceEyebrow")}</TableHead>
                <TableHead>{t("instrumentKind")}</TableHead>
                <TableHead className="text-right">{t("minted")}</TableHead>
                <TableHead className="text-right">{t("placed")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Link
                    href={`/issuances/${ON_CHAIN_DEMO_ISSUANCE_ID}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {ON_CHAIN_DEMO_ISSUANCE_ID}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    href="/instruments/WHEAT-2027"
                    className="text-primary hover:underline"
                  >
                    WHEAT-2027
                  </Link>
                </TableCell>
                <TableCell className="text-right font-tabular">
                  {formatInteger(snapshot.supply.mintedSupply, locale)}
                </TableCell>
                <TableCell className="text-right font-tabular">
                  {formatInteger(snapshot.supply.placed, locale)}
                </TableCell>
                <TableCell>{t("settled")}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </PageSection>
    </div>
  );
}
