import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
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
import { formatScore } from "@/lib/format";
import { stageMediaForRole } from "@/lib/surface/role-media";
import { requirePermission } from "@/lib/auth/guard";
import { listContractsForActor } from "@/services/access-service";
import { monitoringWarningKeys } from "@/services/workspace-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("scasMonitoringTitle") };
}

export default async function ScasMonitoringPage() {
  const actor = await requirePermission("scas.read");
  const t = await getTranslations("workspace");
  const tCatalog = await getTranslations("catalog");
  const tDesk = await getTranslations("desk");
  const tSurface = await getTranslations("surface");
  const items = listContractsForActor(actor);
  const media = stageMediaForRole("SCAS_OPERATOR");

  return (
    <div>
      <PageHeader
        eyebrow={t("scasMonitoringEyebrow")}
        title={t("scasMonitoringTitle")}
        description={t("scasMonitoringIntro")}
        photo={media.src}
        photoAlt={tDesk(media.altKey)}
        photoPosition={media.position}
        kenBurnsOrigin={media.kenBurnsOrigin}
        asOfLabel={tSurface("clockLabel")}
      />
      <DeskSplit
        compact={
          <DeskLedger>
            {items.map(({ contract, producer }, index) => {
              const warnings = monitoringWarningKeys(contract);
              return (
                <DeskRow
                  key={contract.id}
                  href={`/contracts/${contract.id}`}
                  index={deskIndex(index)}
                  kicker={contract.id}
                  title={producer.legalName}
                  value={formatScore(producer.score.value, producer.score.maxValue)}
                  hint={
                    warnings.length === 0 ? t("noAnomalies") : warnings.join(", ")
                  }
                />
              );
            })}
          </DeskLedger>
        }
        wide={
          <Table className="min-w-[56rem]">
            <TableHeader>
              <TableRow>
                <StickyHead>DAC</StickyHead>
                <TableHead>{t("holder")}</TableHead>
                <TableHead>{t("cadastral")}</TableHead>
                <TableHead>{t("satellite")}</TableHead>
                <TableHead>{t("soilMoisture")}</TableHead>
                <TableHead>{t("insuranceStatus")}</TableHead>
                <TableHead>{t("score")}</TableHead>
                <TableHead>{t("verificationState")}</TableHead>
                <TableHead>{t("anomalies")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(({ contract, producer }) => {
                const warnings = monitoringWarningKeys(contract);
                return (
                  <TableRow key={contract.id}>
                    <StickyCell>
                      <Link
                        href={`/contracts/${contract.id}`}
                        className="font-tabular text-xs text-harvest hover:underline"
                      >
                        {contract.id}
                      </Link>
                    </StickyCell>
                    <TableCell>
                      {producer.legalName}
                      <span className="block text-xs text-straw">
                        {lookupMessage(tCatalog, `regions.${contract.field.region}`)} ·{" "}
                        {contract.field.cadastralRef}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {contract.field.cadastralRef}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={contract.monitoring.satellite} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={contract.monitoring.soilMoisture} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={contract.insurance.status} />
                    </TableCell>
                    <TableCell className="font-tabular">
                      {formatScore(producer.score.value, producer.score.maxValue)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={contract.status} />
                    </TableCell>
                    <TableCell className="text-xs text-straw">
                      {warnings.length === 0 ? t("noAnomalies") : warnings.join(", ")}
                    </TableCell>
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
