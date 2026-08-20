import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { FieldMapPlaceholder } from "@/components/contracts/field-map-placeholder";
import { DataList } from "@/components/shared/data-list";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatScore } from "@/lib/format";
import { lookupMessage } from "@/i18n/t-dynamic";
import { getContract, listContractIds } from "@/services/contract-service";

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
  const tStatus = await getTranslations("status");
  const locale = (await getLocale()) as AppLocale;

  return (
    <div>
      <p className="mb-4 text-sm">
        <Link href="/contracts" className="text-muted-foreground hover:text-foreground">
          {tNav("contracts")}
        </Link>
        <span className="mx-2 text-muted-foreground">/</span>
        <span className="font-mono">{contract.id}</span>
      </p>
      <PageHeader
        eyebrow={t("detailEyebrow")}
        title={contract.id}
        description={`${producer.legalName} · ${lookupMessage(tCatalog, `crops.${contract.production.crop}`)} · ${contract.production.season}`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge value={contract.status} />
        <StatusBadge value={contract.verification.landRights} />
        <span className="text-xs text-muted-foreground">
          {t("producerScore")}{" "}
          {formatScore(producer.score.value, producer.score.maxValue)}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t("sections.contract")}>
          <DataList
            items={[
              { label: t("fields.contractId"), value: contract.id },
              { label: t("fields.status"), value: tStatus(contract.status) },
              { label: t("fields.season"), value: String(contract.production.season) },
              {
                label: t("fields.deliveryPeriod"),
                value: lookupMessage(tCatalog, `delivery.${contract.production.deliveryPeriod}`),
              },
            ]}
          />
        </Section>
        <Section title={t("sections.producer")}>
          <DataList
            items={[
              { label: t("fields.legalName"), value: producer.legalName },
              {
                label: t("fields.region"),
                value: lookupMessage(tCatalog, `regions.${producer.region}`),
              },
              {
                label: t("producerScore"),
                value: formatScore(producer.score.value, producer.score.maxValue),
              },
              { label: t("fields.scoreAsOf"), value: producer.score.asOf },
            ]}
          />
        </Section>
        <Section title={t("sections.field")}>
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
              { label: t("fields.cadastralRef"), value: contract.field.cadastralRef },
              { label: t("fields.centroid"), value: contract.field.centroidLabel },
            ]}
          />
        </Section>
        <Section title={t("sections.production")}>
          <DataList
            items={[
              {
                label: t("fields.crop"),
                value: lookupMessage(tCatalog, `crops.${contract.production.crop}`),
              },
              {
                label: t("fields.quality"),
                value: lookupMessage(tCatalog, `quality.${contract.production.quality}`),
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
                label: t("fields.deliveryPeriod"),
                value: lookupMessage(tCatalog, `delivery.${contract.production.deliveryPeriod}`),
              },
            ]}
          />
        </Section>
        <Section title={t("sections.verification")}>
          <DataList
            items={[
              {
                label: t("fields.landRights"),
                value: tStatus(contract.verification.landRights),
              },
              { label: t("fields.kyb"), value: tStatus(contract.verification.kyb) },
              {
                label: t("fields.directorKyc"),
                value: tStatus(contract.verification.directorKyc),
              },
              {
                label: t("fields.fieldVerified"),
                value: tStatus(contract.verification.field),
              },
              {
                label: t("fields.cropConfirmed"),
                value: tStatus(contract.verification.crop),
              },
            ]}
          />
        </Section>
        <Section title={t("sections.risk")}>
          <DataList
            items={[
              {
                label: t("producerScore"),
                value: formatScore(producer.score.value, producer.score.maxValue),
              },
              {
                label: t("fields.contractStatus"),
                value: tStatus(contract.status),
              },
              {
                label: t("fields.monitoring"),
                value: tStatus(contract.monitoring.satellite),
              },
              {
                label: t("fields.insurance"),
                value: tStatus(contract.insurance.status),
              },
            ]}
          />
        </Section>
        <Section title={t("sections.monitoring")}>
          <DataList
            items={[
              {
                label: t("fields.satellite"),
                value: tStatus(contract.monitoring.satellite),
              },
              {
                label: t("fields.soilMoisture"),
                value: tStatus(contract.monitoring.soilMoisture),
              },
            ]}
          />
        </Section>
        <Section title={t("sections.insurance")}>
          <DataList
            items={[
              {
                label: t("fields.insurance"),
                value: tStatus(contract.insurance.status),
              },
              { label: t("fields.provider"), value: lookupMessage(tCatalog, `insuranceProvider.${contract.insurance.provider}`) },
              { label: t("fields.policyRef"), value: contract.insurance.policyRef },
            ]}
          />
        </Section>
      </div>

      <div className="mt-6">
        <FieldMapPlaceholder
          region={contract.field.region}
          cadastralRef={contract.field.cadastralRef}
          centroidLabel={contract.field.centroidLabel}
          areaHectares={contract.field.areaHectares}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
