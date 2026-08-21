import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FieldMapPlaceholder } from "@/components/contracts/field-map-placeholder";
import { OnChainProofPanel } from "@/components/contracts/on-chain-proof-panel";
import { AuditTrail } from "@/components/regulator/audit-trail";
import { DataList } from "@/components/shared/data-list";
import { FactStrip } from "@/components/shared/fact-strip";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import type { AppLocale } from "@/i18n/config";
import { lookupMessage } from "@/i18n/t-dynamic";
import { formatInteger, formatScore } from "@/lib/format";
import { blockchainProvider } from "@/services/providers";
import { getContract, listContractIds } from "@/services/contract-service";
import { listLedgerEventsForContract } from "@/services/regulator-service";

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ contractId: string }>;
}): Promise<Metadata> {
  const { contractId } = await params;
  return { title: contractId };
}

export function generateStaticParams() {
  return listContractIds().map((contractId) => ({ contractId }));
}

export default async function ContractDetailPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const { contractId } = await params;
  const item = getContract(contractId);

  if (!item) {
    notFound();
  }

  const { contract, producer } = item;
  const t = await getTranslations("contracts");
  const tNav = await getTranslations("nav");
  const tCatalog = await getTranslations("catalog");
  const tUnits = await getTranslations("units");
  const locale = (await getLocale()) as AppLocale;
  const relatedAudit = await listLedgerEventsForContract(contract.id);
  const onChain = await blockchainProvider.getDigitalAgriculturalContract(
    contract.id,
  );

  return (
    <div>
      <p className="mb-4 text-sm">
        <Link
          href="/contracts"
          className="text-muted-foreground hover:text-foreground"
        >
          {tNav("contracts")}
        </Link>
        <span className="mx-2 text-muted-foreground">/</span>
        <span className="font-tabular text-xs">{contract.id}</span>
      </p>
      <PageHeader
        eyebrow={t("detailEyebrow")}
        title={contract.id}
        description={producer.legalName}
      />

      <FactStrip
        className="mb-2"
        items={[
          { label: t("fields.contractId"), value: contract.id },
          {
            label: t("fields.status"),
            value: <StatusBadge value={contract.status} />,
          },
          { label: t("fields.legalName"), value: producer.legalName },
          {
            label: t("fields.crop"),
            value: lookupMessage(tCatalog, `crops.${contract.production.crop}`),
          },
          {
            label: t("fields.expectedProduction"),
            value: tUnits("tonnes", {
              value: formatInteger(
                contract.production.expectedProductionTonnes,
                locale,
              ),
            }),
          },
          {
            label: t("fields.season"),
            value: String(contract.production.season),
          },
        ]}
      />

      <PageSection
        title={t("sections.asset")}
        description={t("businessRecord")}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <DataList
            items={[
              {
                label: t("fields.region"),
                value: lookupMessage(tCatalog, `regions.${contract.field.region}`),
              },
              {
                label: t("fields.fieldArea"),
                value: tUnits("hectares", {
                  value: formatInteger(contract.field.areaHectares, locale),
                }),
              },
              {
                label: t("fields.cadastralRef"),
                value: (
                  <span className="font-tabular text-xs">
                    {contract.field.cadastralRef}
                  </span>
                ),
              },
              {
                label: t("fields.quality"),
                value: lookupMessage(
                  tCatalog,
                  `quality.${contract.production.quality}`,
                ),
              },
              {
                label: t("fields.deliveryPeriod"),
                value: lookupMessage(
                  tCatalog,
                  `delivery.${contract.production.deliveryPeriod}`,
                ),
              },
              {
                label: t("producerScore"),
                value: formatScore(
                  producer.score.value,
                  producer.score.maxValue,
                ),
              },
            ]}
          />
          <FieldMapPlaceholder
            region={contract.field.region}
            cadastralRef={contract.field.cadastralRef}
            centroidLabel={contract.field.centroidLabel}
            areaHectares={contract.field.areaHectares}
          />
        </div>
      </PageSection>

      <PageSection
        title={t("sections.verification")}
        description={t("verificationEvidence")}
      >
        <DataList
          items={[
            {
              label: t("fields.landRights"),
              value: <StatusBadge value={contract.verification.landRights} />,
            },
            {
              label: t("fields.kyb"),
              value: <StatusBadge value={contract.verification.kyb} />,
            },
            {
              label: t("fields.directorKyc"),
              value: <StatusBadge value={contract.verification.directorKyc} />,
            },
            {
              label: t("fields.fieldVerified"),
              value: <StatusBadge value={contract.verification.field} />,
            },
            {
              label: t("fields.cropConfirmed"),
              value: <StatusBadge value={contract.verification.crop} />,
            },
          ]}
        />
      </PageSection>

      <PageSection title={t("sections.monitoring")}>
        <DataList
          items={[
            {
              label: t("fields.satellite"),
              value: <StatusBadge value={contract.monitoring.satellite} />,
            },
            {
              label: t("fields.soilMoisture"),
              value: <StatusBadge value={contract.monitoring.soilMoisture} />,
            },
          ]}
        />
      </PageSection>

      <PageSection title={t("sections.risk")}>
        <DataList
          items={[
            {
              label: t("producerScore"),
              value: formatScore(producer.score.value, producer.score.maxValue),
            },
            {
              label: t("fields.scoreAsOf"),
              value: producer.score.asOf,
            },
            {
              label: t("fields.contractStatus"),
              value: <StatusBadge value={contract.status} />,
            },
            {
              label: t("fields.monitoring"),
              value: <StatusBadge value={contract.monitoring.satellite} />,
            },
            {
              label: t("fields.insurance"),
              value: <StatusBadge value={contract.insurance.status} />,
            },
          ]}
        />
      </PageSection>

      <PageSection title={t("sections.insurance")}>
        <DataList
          items={[
            {
              label: t("fields.insurance"),
              value: <StatusBadge value={contract.insurance.status} />,
            },
            {
              label: t("fields.provider"),
              value: lookupMessage(
                tCatalog,
                `insuranceProvider.${contract.insurance.provider}`,
              ),
            },
            { label: t("fields.policyRef"), value: contract.insurance.policyRef },
          ]}
        />
      </PageSection>

      <PageSection title={t("sections.audit")}>
        <AuditTrail events={relatedAudit} />
      </PageSection>

      <OnChainProofPanel lookup={onChain} locale={locale} />
    </div>
  );
}
