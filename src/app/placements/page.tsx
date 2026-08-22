import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/shared/page-section";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { actorCan } from "@/domain/identity";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { requirePermission } from "@/lib/auth/guard";
import { listPrimaryPlacementsForActor } from "@/services/placement-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("placementsTitle") };
}

export default async function PlacementsPage() {
  const actor = await requirePermission(
    "placement.read.all",
    "placement.read.own",
    "regulator.read",
  );
  const t = await getTranslations("workspace");
  const locale = (await getLocale()) as AppLocale;
  const ownOnly =
    actorCan(actor, "portfolio.read.own") &&
    !actorCan(actor, "placement.read.all") &&
    !actorCan(actor, "regulator.read");
  const rows = await listPrimaryPlacementsForActor(actor);

  return (
    <div>
      <PageHeader
        eyebrow={t("placementsEyebrow")}
        title={ownOnly ? t("myPlacementsTitle") : t("placementsTitle")}
        description={ownOnly ? t("myPlacementsIntro") : t("placementsIntro")}
      />
      {rows.length === 0 ? (
        <EmptyState>{t("noPlacements")}</EmptyState>
      ) : (
        <Table className="min-w-[48rem]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("relatedPlacement")}</TableHead>
              <TableHead>{t("relatedIssuance")}</TableHead>
              <TableHead>{t("instrumentKind")}</TableHead>
              <TableHead>{t("investorRef")}</TableHead>
              <TableHead className="text-right">{t("quantity")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("atomicDvp")}</TableHead>
              <TableHead>{t("network")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ placement }) => (
              <TableRow key={placement.id}>
                <TableCell>
                  <Link
                    href={`/market/${placement.id}`}
                    className="font-tabular text-xs text-primary hover:underline"
                  >
                    {placement.id}
                  </Link>
                </TableCell>
                <TableCell>{placement.issuanceId}</TableCell>
                <TableCell>
                  <Link
                    href={`/tokens/${placement.instrumentSymbol}`}
                    className="text-primary hover:underline"
                  >
                    {placement.instrumentSymbol}
                  </Link>
                </TableCell>
                <TableCell>{placement.investorReference}</TableCell>
                <TableCell className="text-right font-tabular">
                  {formatInteger(placement.quantity, locale)}
                </TableCell>
                <TableCell>
                  <StatusBadge value={placement.status} />
                </TableCell>
                <TableCell>{t("atomicDvp")}</TableCell>
                <TableCell>{placement.network}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
