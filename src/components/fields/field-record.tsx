import { getLocale, getTranslations } from "next-intl/server";
import { FieldMapPlaceholder } from "@/components/contracts/field-map-placeholder";
import { DataList } from "@/components/shared/data-list";
import { PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  DeskBackLink,
  DeskLedger,
  DeskRow,
  deskIndex,
} from "@/components/surface/desk-stage";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger } from "@/lib/format";
import type { ContractListItem } from "@/services/contract-service";
import { demonstratorContractPath } from "@/lib/origination/paths";

export function fieldHref(contractId: string): string {
  return demonstratorContractPath(contractId);
}

export async function FieldPlotsLedger({
  items,
  activeId,
  hrefFor = fieldHref,
}: {
  items: ContractListItem[];
  activeId?: string;
  hrefFor?: (contractId: string) => string;
}) {
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;

  return (
    <DeskLedger>
      {items.map((item, index) => {
        const active = item.contract.id === activeId;
        return (
          <DeskRow
            key={item.contract.id}
            href={hrefFor(item.contract.id)}
            active={active}
            index={deskIndex(index)}
            kicker={lookupMessage(tCatalog, `regions.${item.contract.field.region}`)}
            title={item.contract.field.cadastralRef}
            value={tUnits("hectaresShort", {
              value: formatInteger(item.contract.field.areaHectares, locale),
            })}
            hint={item.contract.status}
          />
        );
      })}
    </DeskLedger>
  );
}

export async function FieldDetailRecord({ item }: { item: ContractListItem }) {
  const t = await getTranslations("workspace");
  const tContracts = await getTranslations("contracts");
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const { contract, producer } = item;

  return (
    <>
      <DataList
        items={[
          { label: tContracts("fields.legalName"), value: producer.legalName },
          {
            label: t("cadastral"),
            value: contract.field.cadastralRef,
          },
          {
            label: tContracts("fields.region"),
            value: lookupMessage(tCatalog, `regions.${contract.field.region}`),
          },
          {
            label: t("area"),
            value: tUnits("hectaresShort", {
              value: formatInteger(contract.field.areaHectares, locale),
            }),
          },
          {
            label: tContracts("fields.crop"),
            value: lookupMessage(tCatalog, `crops.${contract.production.crop}`),
          },
          { label: t("season"), value: String(contract.production.season) },
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
        ]}
      />
      <div className="mt-6">
        <p className="mb-3 text-sm text-straw">{t("noGis")}</p>
        <FieldMapPlaceholder
          region={contract.field.region}
          cadastralRef={contract.field.cadastralRef}
          centroidLabel={contract.field.centroidLabel}
          areaHectares={contract.field.areaHectares}
        />
      </div>
    </>
  );
}

export async function FieldSiblings({
  items,
  activeId,
  hrefFor,
}: {
  items: ContractListItem[];
  activeId: string;
  hrefFor?: (contractId: string) => string;
}) {
  const tDesk = await getTranslations("desk");
  if (items.length < 2) {
    return null;
  }

  return (
    <PageSection title={tDesk("plots")}>
      <FieldPlotsLedger items={items} activeId={activeId} hrefFor={hrefFor} />
    </PageSection>
  );
}

export function FieldsBackLink({ label }: { label: string }) {
  return <DeskBackLink href="/fields" label={label} />;
}
