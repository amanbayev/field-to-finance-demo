import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CoverageConsole } from "@/components/coverage/coverage-console";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyCell, StickyHead } from "@/components/shared/sticky-cell";
import {
  DeskLedger,
  DeskRow,
  DeskSplit,
  deskIndex,
} from "@/components/surface/desk-stage";
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
import { formatInteger } from "@/lib/format";
import { ON_CHAIN_DEMO_POOL_ID } from "@/adapters/blockchain";
import { requireAllPermissions } from "@/lib/auth/guard";
import { listContracts } from "@/services/contract-service";
import { getPool, poolMembershipForContract } from "@/services/pool-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("backingTitle") };
}

export default async function BackingPage() {
  await requireAllPermissions("issuance.manage", "audit.read");
  const t = await getTranslations("workspace");
  const tContracts = await getTranslations("contracts");
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const pool = getPool(ON_CHAIN_DEMO_POOL_ID);
  const contracts = listContracts();

  return (
    <div>
      <PageHeader
        eyebrow={t("backingEyebrow")}
        title={t("backingTitle")}
        description={t("backingIntro")}
        photo="/media/grain-kernel-macro.png"
      />
      <PageSection title={t("traceContracts")}>
        <DeskSplit
          compact={
            <DeskLedger>
              {contracts.map(({ contract, producer }, index) => {
                const membership = poolMembershipForContract(contract.id);
                return (
                  <DeskRow
                    key={contract.id}
                    href={`/contracts/${contract.id}`}
                    index={deskIndex(index)}
                    kicker={contract.id}
                    title={producer.legalName}
                    value={tUnits("tonnes", {
                      value: formatInteger(
                        membership?.member.volumeTonnes ??
                          contract.production.expectedProductionTonnes,
                        locale,
                      ),
                    })}
                    hint={
                      membership
                        ? `${membership.pool.id} · ${membership.member.eligibility}`
                        : t("notAllocated")
                    }
                  />
                );
              })}
            </DeskLedger>
          }
          wide={
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  <StickyHead>DAC</StickyHead>
                  <TableHead>{t("holder")}</TableHead>
                  <TableHead>{tContracts("fields.crop")}</TableHead>
                  <TableHead>{t("tracePool")}</TableHead>
                  <TableHead>{t("eligibility")}</TableHead>
                  <TableHead className="text-right">{t("quantity")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map(({ contract, producer }) => {
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
                      <TableCell>{producer.legalName}</TableCell>
                      <TableCell>
                        {lookupMessage(tCatalog, `crops.${contract.production.crop}`)}
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
                          t("notAllocated")
                        )}
                      </TableCell>
                      <TableCell>
                        {membership ? (
                          <StatusBadge value={membership.member.eligibility} />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right font-tabular">
                        {tUnits("tonnes", {
                          value: formatInteger(
                            membership?.member.volumeTonnes ??
                              contract.production.expectedProductionTonnes,
                            locale,
                          ),
                        })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          }
        />
      </PageSection>
      <PageSection
        title={t("traceCoverage")}
        description={pool ? pool.pool.id : ON_CHAIN_DEMO_POOL_ID}
      >
        <CoverageConsole />
      </PageSection>
    </div>
  );
}
