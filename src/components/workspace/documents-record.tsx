import { getTranslations } from "next-intl/server";
import { DataList } from "@/components/shared/data-list";
import { StatusBadge } from "@/components/shared/status-badge";
import { DeskLedger, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { ContractListItem } from "@/services/contract-service";
import { isVerificationComplete } from "@/services/workspace-view";

export function documentsHref(contractId: string): string {
  return `/documents/${contractId}`;
}

const CLEAR = new Set(["VERIFIED", "PASSED", "CONFIRMED", "ACTIVE"]);

export function documentCheckCount(item: ContractListItem): {
  clear: number;
  total: number;
} {
  const values = [
    item.contract.verification.kyb,
    item.contract.verification.directorKyc,
    item.contract.verification.landRights,
    item.contract.verification.field,
    item.contract.verification.crop,
    item.contract.insurance.status,
  ];
  return {
    clear: values.filter((value) => CLEAR.has(value)).length,
    total: values.length,
  };
}

export async function DocumentsPlotsLedger({
  items,
  activeId,
}: {
  items: ContractListItem[];
  activeId?: string;
}) {
  const tCatalog = await getTranslations("catalog");
  const tStatus = await getTranslations("status");

  return (
    <DeskLedger>
      {items.map((item, index) => {
        const complete = isVerificationComplete(item.contract.verification);
        return (
          <DeskRow
            key={item.contract.id}
            href={documentsHref(item.contract.id)}
            active={item.contract.id === activeId}
            index={deskIndex(index)}
            kicker={lookupMessage(tCatalog, `regions.${item.contract.field.region}`)}
            title={item.contract.field.cadastralRef}
            value={lookupMessage(tStatus, complete ? "VERIFIED" : "PENDING")}
            hint={item.contract.id}
          />
        );
      })}
    </DeskLedger>
  );
}

export async function DocumentsDetailRecord({ item }: { item: ContractListItem }) {
  const t = await getTranslations("workspace");
  const { contract } = item;

  return (
    <DataList
      items={[
        { label: t("cadastral"), value: contract.field.cadastralRef },
        {
          label: t("kyb"),
          value: <StatusBadge value={contract.verification.kyb} />,
        },
        {
          label: t("directorKyc"),
          value: <StatusBadge value={contract.verification.directorKyc} />,
        },
        {
          label: t("landRights"),
          value: <StatusBadge value={contract.verification.landRights} />,
        },
        {
          label: t("fieldVerification"),
          value: <StatusBadge value={contract.verification.field} />,
        },
        {
          label: t("cropConfirmation"),
          value: <StatusBadge value={contract.verification.crop} />,
        },
        {
          label: t("insuranceStatus"),
          value: <StatusBadge value={contract.insurance.status} />,
        },
      ]}
    />
  );
}
