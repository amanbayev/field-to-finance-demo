import { getTranslations } from "next-intl/server";
import { DeskLedger, DeskNote, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { ContractListItem } from "@/services/contract-service";
import {
  producerFinancingStages,
  type FinancingStageId,
} from "@/services/workspace-view";

export function financeHref(contractId: string): string {
  return `/finance/${contractId}`;
}

export const FINANCING_STAGE_LABEL: Record<FinancingStageId, string> = {
  dac: "lifecycleDac",
  scas: "lifecycleScas",
  matching: "lifecycleMatching",
  pool: "lifecyclePool",
  coverage: "lifecycleCoverage",
  finance: "lifecycleFinance",
};

export function financingProgress(item: ContractListItem) {
  const stages = producerFinancingStages(item.contract);
  const done = stages.filter((stage) => stage.done).length;
  const next = stages.find((stage) => !stage.done);
  const readyForCapital = stages
    .filter((stage) => stage.id !== "finance")
    .every((stage) => stage.done);
  return {
    stages,
    done,
    total: stages.length,
    next,
    readyForCapital,
  };
}

export async function FinancePlotsLedger({
  items,
  activeId,
}: {
  items: ContractListItem[];
  activeId?: string;
}) {
  const t = await getTranslations("workspace");
  const tCatalog = await getTranslations("catalog");

  return (
    <DeskLedger>
      {items.map((item, index) => {
        const progress = financingProgress(item);
        const nextLabel = progress.next
          ? lookupMessage(t, FINANCING_STAGE_LABEL[progress.next.id])
          : t("financeNotProvided");
        return (
          <DeskRow
            key={item.contract.id}
            href={financeHref(item.contract.id)}
            active={item.contract.id === activeId}
            index={deskIndex(index)}
            kicker={lookupMessage(tCatalog, `regions.${item.contract.field.region}`)}
            title={item.contract.field.cadastralRef}
            value={`${progress.done} / ${progress.total}`}
            hint={`${item.contract.id} · ${nextLabel}`}
          />
        );
      })}
    </DeskLedger>
  );
}

export async function FinanceStageLedger({ item }: { item: ContractListItem }) {
  const t = await getTranslations("workspace");
  const tDesk = await getTranslations("desk");
  const progress = financingProgress(item);

  return (
    <>
      <DeskNote className="mb-8">{t("financeNotProvided")}</DeskNote>
      <DeskLedger>
        {progress.stages.map((stage, index) => (
          <DeskRow
            key={stage.id}
            index={deskIndex(index)}
            title={lookupMessage(t, FINANCING_STAGE_LABEL[stage.id])}
            value={stage.done ? t("stageDone") : t("stageOpen")}
            hint={
              !stage.done && progress.next?.id === stage.id
                ? tDesk("nextStage")
                : undefined
            }
          />
        ))}
      </DeskLedger>
    </>
  );
}
