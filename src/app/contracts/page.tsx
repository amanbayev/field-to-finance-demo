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
import {
  ON_CHAIN_DEMO_CONTRACT_IDS,
  isOnChainDemoContract,
  type OnChainContractLookup,
} from "@/adapters/blockchain";
import { listContractsForActor } from "@/services/access-service";
import { requirePermission } from "@/lib/auth/guard";
import { blockchainProvider } from "@/services/providers";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contracts");
  return { title: t("title") };
}

export default async function ContractsPage() {
  const actor = await requirePermission("contracts.read.all", "contracts.read.own");
  const t = await getTranslations("contracts");
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const items = listContractsForActor(actor);
  const proofEntries = await Promise.all(
    ON_CHAIN_DEMO_CONTRACT_IDS.map(
      async (id) =>
        [id, await blockchainProvider.getDigitalAgriculturalContract(id)] as const,
    ),
  );
  const proofs = Object.fromEntries(proofEntries) as Record<
    string,
    OnChainContractLookup
  >;

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
                  value={proofStatusForContract(contract.id, proofs)}
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

function proofStatusForContract(
  contractId: string,
  proofs: Record<string, OnChainContractLookup>,
): string {
  if (!isOnChainDemoContract(contractId)) {
    return "OFF_CHAIN";
  }
  const proof = proofs[contractId];
  if (!proof || proof.status === "unavailable") {
    return "PROOF_UNAVAILABLE";
  }
  if (proof.status !== "found" || !proof.contract) {
    return "OFF_CHAIN";
  }
  return proof.contract.status === "Verified"
    ? "VERIFIED_ON_CHAIN"
    : "ON_CHAIN";
}
