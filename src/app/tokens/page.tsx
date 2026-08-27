import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
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
import {
  DeskLedger,
  DeskRow,
  DeskSplit,
  deskIndex,
} from "@/components/surface/desk-stage";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import { requirePermission } from "@/lib/auth/guard";
import { getPlacementSnapshot } from "@/services/placement-service";
import { listTokens } from "@/services/token-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("tokenRegistryTitle") };
}

export default async function TokensRegistryPage() {
  await requirePermission("issuance.read");
  const t = await getTranslations("workspace");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = await getPlacementSnapshot();
  const tokens = listTokens();

  return (
    <div>
      <PageHeader
        eyebrow={t("tokenRegistryTitle")}
        title={t("tokenRegistryTitle")}
        description={t("tokenRegistryIntro")}
        photo="/media/grain-kernel-macro.png"
      />
      <DeskSplit
        compact={
          <DeskLedger>
            {tokens.map((token, index) => (
              <DeskRow
                key={token.id}
                href={`/instruments/${token.symbol}`}
                index={deskIndex(index)}
                kicker={token.type}
                title={token.symbol}
                value={formatInteger(snapshot.supply.mintedSupply, locale)}
                hint={token.poolId}
              />
            ))}
          </DeskLedger>
        }
        wide={
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("instrumentKind")}</TableHead>
                <TableHead>{t("underlyingPool")}</TableHead>
                <TableHead className="text-right">{t("minted")}</TableHead>
                <TableHead className="text-right">{t("circulating")}</TableHead>
                <TableHead>{t("network")}</TableHead>
                <TableHead>{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell>
                    <Link
                      href={`/instruments/${token.symbol}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {token.symbol}
                    </Link>
                    <p className="text-xs text-muted-foreground">{token.type}</p>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/pools/${token.poolId}`}
                      className="font-tabular text-xs text-primary hover:underline"
                    >
                      {token.poolId}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(snapshot.supply.mintedSupply, locale)}
                  </TableCell>
                  <TableCell className="text-right font-tabular">
                    {formatInteger(snapshot.supply.circulating, locale)}
                  </TableCell>
                  <TableCell>{token.network}</TableCell>
                  <TableCell>
                    <StatusBadge
                      value={
                        snapshot.mintLookup.status === "found"
                          ? "DEPLOYED"
                          : token.blockchainStatus
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        }
      />
    </div>
  );
}
