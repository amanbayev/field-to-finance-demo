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
import {
  DeskLedger,
  DeskRow,
  DeskSplit,
  deskIndex,
} from "@/components/surface/desk-stage";
import { actorCan } from "@/domain/identity";
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
import { poolMembershipForContract } from "@/services/pool-service";
import { isVerificationComplete } from "@/services/workspace-view";

export async function generateMetadata(): Promise<Metadata> {
  const actor = await requirePermission(
    "contracts.read.all",
    "contracts.read.own",
  );
  const t = await getTranslations("contracts");
  const tWorkspace = await getTranslations("workspace");
  return {
    title: actorCan(actor, "contracts.read.all")
      ? t("title")
      : tWorkspace("ownContractsTitle"),
  };
}

export default async function ContractsPage() {
  const actor = await requirePermission(
    "contracts.read.all",
    "contracts.read.own",
  );
  const ownOnly = !actorCan(actor, "contracts.read.all");
  const t = await getTranslations("contracts");
  const tWorkspace = await getTranslations("workspace");
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
        eyebrow={ownOnly ? tWorkspace("fieldsEyebrow") : t("eyebrow")}
        title={ownOnly ? tWorkspace("ownContractsTitle") : t("title")}
        description={ownOnly ? tWorkspace("ownContractsIntro") : t("description")}
      />
      <DeskSplit
        compact={
          <DeskLedger>
            {items.map(({ contract, producer }, index) => {
              const membership = poolMembershipForContract(contract.id);
              return (
                <DeskRow
                  key={contract.id}
                  href={`/contracts/${contract.id}`}
                  index={deskIndex(index)}
                  kicker={
                    ownOnly
                      ? contract.field.cadastralRef
                      : producer.legalName
                  }
                  title={contract.id}
                  value={tUnits("tonnes", {
                    value: formatInteger(
                      contract.production.expectedProductionTonnes,
                      locale,
                    ),
                  })}
                  hint={[
                    lookupMessage(tCatalog, `crops.${contract.production.crop}`),
                    contract.status,
                    membership?.pool.id ?? tWorkspace("notAllocated"),
                  ].join(" · ")}
                />
              );
            })}
          </DeskLedger>
        }
        wide={
          <Table className="min-w-[64rem]">
            <TableHeader>
              <TableRow>
                <StickyHead>{t("columns.contractId")}</StickyHead>
                {ownOnly ? null : <TableHead>{t("columns.producer")}</TableHead>}
                <TableHead>{t("columns.crop")}</TableHead>
                <TableHead>{t("columns.season")}</TableHead>
                <TableHead className="text-right">{t("columns.volume")}</TableHead>
                <TableHead>{t("columns.delivery")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.verification")}</TableHead>
                <TableHead>{t("columns.pool")}</TableHead>
                <TableHead>{t("columns.proof")}</TableHead>
                {ownOnly ? null : (
                  <TableHead className="text-right">{t("columns.score")}</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(({ contract, producer }) => {
                const membership = poolMembershipForContract(contract.id);
                return (
                  <TableRow key={contract.id}>
                    <StickyCell>
                      <Link
                        href={`/contracts/${contract.id}`}
                        className="font-tabular text-xs text-primary hover:underline"
                      >
                        {contract.id}
                      </Link>
                    </StickyCell>
                    {ownOnly ? null : (
                      <TableCell className="font-medium">{producer.legalName}</TableCell>
                    )}
                    <TableCell>
                      {lookupMessage(tCatalog, `crops.${contract.production.crop}`)}
                    </TableCell>
                    <TableCell className="font-tabular">
                      {contract.production.season}
                    </TableCell>
                    <TableCell className="text-right font-tabular">
                      {tUnits("tonnes", {
                        value: formatInteger(
                          contract.production.expectedProductionTonnes,
                          locale,
                        ),
                      })}
                    </TableCell>
                    <TableCell>{contract.production.deliveryPeriod}</TableCell>
                    <TableCell>
                      <StatusBadge value={contract.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        value={
                          isVerificationComplete(contract.verification)
                            ? "VERIFIED"
                            : "PENDING"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      {membership ? (
                        <Link
                          href={`/pools/${membership.pool.id}`}
                          className="font-tabular text-xs text-primary hover:underline"
                        >
                          {membership.pool.id}
                        </Link>
                      ) : (
                        tWorkspace("notAllocated")
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        value={proofStatusForContract(contract.id, proofs)}
                      />
                    </TableCell>
                    {ownOnly ? null : (
                      <TableCell className="text-right font-tabular">
                        {formatScore(producer.score.value, producer.score.maxValue)}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        }
      />
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
