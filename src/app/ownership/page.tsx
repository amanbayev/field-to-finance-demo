import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DEMO_ORGANIZATIONS } from "@/data/identity/demo-catalog";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import {
  explorerAddressUrl,
  INVESTOR_0001_REFERENCE,
} from "@/adapters/blockchain";
import { requireAllPermissions } from "@/lib/auth/guard";
import { getPlacementSnapshot } from "@/services/placement-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("ownershipTitle") };
}

function ExplorerAccount({ address }: { address?: string }) {
  if (!address) {
    return <span>—</span>;
  }
  return (
    <a
      href={explorerAddressUrl(address)}
      target="_blank"
      rel="noreferrer"
      className="break-all font-mono text-[11px] text-primary hover:underline"
    >
      {address}
    </a>
  );
}

export default async function OwnershipPage() {
  await requireAllPermissions("issuance.manage", "audit.read");
  const t = await getTranslations("workspace");
  const locale = (await getLocale()) as AppLocale;
  const snapshot = await getPlacementSnapshot();
  const investorOrg = DEMO_ORGANIZATIONS.find(
    (org) => org.externalInvestorRef === INVESTOR_0001_REFERENCE,
  );
  const live = snapshot.liveBalances;
  const registrarQty = snapshot.supply.registrarInventory;
  const investorQty = snapshot.supply.circulating;
  const total = snapshot.supply.mintedSupply;

  return (
    <div>
      <PageHeader
        eyebrow={t("ownershipEyebrow")}
        title={t("ownershipTitle")}
        description={t("ownershipIntro")}
      />
      <p className="mb-4 text-xs text-muted-foreground">
        {live ? t("liveBalance") : t("recordedFallback")} · {snapshot.recorded.instrumentSymbol} ·{" "}
        {t("network")}: Solana Devnet
      </p>
      <MetricStrip>
        <MetricCell
          label={t("registrarHolding")}
          value={formatInteger(registrarQty, locale)}
        />
        <MetricCell
          label={investorOrg?.name ?? INVESTOR_0001_REFERENCE}
          value={formatInteger(investorQty, locale)}
        />
        <MetricCell
          emphasis="primary"
          label={t("totalSupply")}
          value={formatInteger(total, locale)}
        />
      </MetricStrip>
      <Table className="mt-6 min-w-[48rem]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("holder")}</TableHead>
            <TableHead className="text-right">{t("quantity")}</TableHead>
            <TableHead>{t("publicAccount")}</TableHead>
            <TableHead>{t("tokenAta")}</TableHead>
            <TableHead>{t("proofAvailable")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>{t("registrarHolding")}</TableCell>
            <TableCell className="text-right font-tabular">
              {formatInteger(registrarQty, locale)}
            </TableCell>
            <TableCell>
              <ExplorerAccount address={snapshot.mintLookup.mint?.holder} />
            </TableCell>
            <TableCell>
              <ExplorerAccount address={snapshot.recorded.registrarInstrumentAta} />
            </TableCell>
            <TableCell>
              {snapshot.registrarWheat.status === "found" ? t("proofAvailable") : t("notRecorded")}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell>
              {INVESTOR_0001_REFERENCE}
              {investorOrg ? ` / ${investorOrg.name}` : ""}
            </TableCell>
            <TableCell className="text-right font-tabular">
              {formatInteger(investorQty, locale)}
            </TableCell>
            <TableCell>
              <ExplorerAccount address={snapshot.recorded.investorWallet} />
            </TableCell>
            <TableCell>
              <ExplorerAccount address={snapshot.recorded.investorInstrumentAta} />
            </TableCell>
            <TableCell>
              {snapshot.investorWheat.status === "found" ? t("proofAvailable") : t("notRecorded")}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
