import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyCell, StickyHead } from "@/components/shared/sticky-cell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatScore } from "@/lib/format";
import { isOnChainDemoContract } from "@/adapters/blockchain";
import { listContracts } from "@/services/contract-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contracts");
  return { title: t("title") };
}

export default async function ContractsPage() {
  const t = await getTranslations("contracts");
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const items = listContracts();

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <Table className="min-w-[52rem]">
        <TableHeader>
          <TableRow>
            <StickyHead>{t("columns.contractId")}</StickyHead>
            <TableHead>{t("columns.producer")}</TableHead>
            <TableHead>{t("columns.crop")}</TableHead>
            <TableHead className="text-right">{t("columns.volume")}</TableHead>
            <TableHead>{t("columns.region")}</TableHead>
            <TableHead className="text-right">{t("columns.score")}</TableHead>
            <TableHead>{t("columns.proof")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(({ contract, producer }) => (
            <TableRow key={contract.id}>
              <StickyCell>
                <Link
                  href={`/contracts/${contract.id}`}
                  className="font-tabular text-xs text-primary hover:underline"
                >
                  {contract.id}
                </Link>
              </StickyCell>
              <TableCell className="font-medium">{producer.legalName}</TableCell>
              <TableCell>
                {lookupMessage(tCatalog, `crops.${contract.production.crop}`)}
              </TableCell>
              <TableCell className="text-right font-tabular">
                {tUnits("tonnes", {
                  value: formatInteger(
                    contract.production.expectedProductionTonnes,
                    locale,
                  ),
                })}
              </TableCell>
              <TableCell>
                {lookupMessage(tCatalog, `regions.${contract.field.region}`)}
              </TableCell>
              <TableCell className="text-right font-tabular">
                {formatScore(producer.score.value, producer.score.maxValue)}
              </TableCell>
              <TableCell>
                <StatusBadge
                  value={
                    isOnChainDemoContract(contract.id) ? "ON_CHAIN" : "OFF_CHAIN"
                  }
                />
              </TableCell>
              <TableCell>
                <StatusBadge value={contract.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
