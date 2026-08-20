import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FieldMapPlaceholder } from "@/components/contracts/field-map-placeholder";
import { DataList } from "@/components/shared/data-list";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatHectares,
  formatScore,
  formatTonnes,
} from "@/lib/format";
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

  return (
    <div>
      <p className="mb-4 text-sm">
        <Link href="/contracts" className="text-muted-foreground hover:text-foreground">
          Contracts
        </Link>
        <span className="mx-2 text-muted-foreground">/</span>
        <span className="font-mono">{contract.id}</span>
      </p>
      <PageHeader
        eyebrow="Digital Agricultural Contract"
        title={contract.id}
        description={`${producer.legalName} · ${contract.production.crop} · ${contract.production.season}`}
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge value={contract.status} />
        <StatusBadge value={contract.verification.landRights} />
        <span className="text-xs text-muted-foreground">
          Producer score {formatScore(producer.score.value, producer.score.maxValue)}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Contract">
          <DataList
            items={[
              { label: "Contract ID", value: contract.id },
              { label: "Status", value: contract.status.replaceAll("_", " ") },
              { label: "Season", value: String(contract.production.season) },
              { label: "Delivery period", value: contract.production.deliveryPeriod },
            ]}
          />
        </Section>
        <Section title="Producer">
          <DataList
            items={[
              { label: "Legal name", value: producer.legalName },
              { label: "Region", value: producer.region },
              {
                label: "Producer score",
                value: formatScore(producer.score.value, producer.score.maxValue),
              },
              { label: "Score as of", value: producer.score.asOf },
            ]}
          />
        </Section>
        <Section title="Field">
          <DataList
            items={[
              { label: "Region", value: contract.field.region },
              {
                label: "Field area",
                value: formatHectares(contract.field.areaHectares),
              },
              { label: "Cadastral ref", value: contract.field.cadastralRef },
              { label: "Centroid", value: contract.field.centroidLabel },
            ]}
          />
        </Section>
        <Section title="Production">
          <DataList
            items={[
              { label: "Crop", value: contract.production.crop },
              { label: "Quality", value: contract.production.quality },
              {
                label: "Expected production",
                value: formatTonnes(contract.production.expectedProductionTonnes),
              },
              { label: "Delivery period", value: contract.production.deliveryPeriod },
            ]}
          />
        </Section>
        <Section title="Verification">
          <DataList
            items={[
              { label: "Land rights", value: title(contract.verification.landRights) },
              { label: "KYB", value: title(contract.verification.kyb) },
              { label: "Director KYC", value: title(contract.verification.directorKyc) },
              { label: "Field", value: title(contract.verification.field) },
              { label: "Crop", value: title(contract.verification.crop) },
            ]}
          />
        </Section>
        <Section title="Risk">
          <DataList
            items={[
              {
                label: "Producer score",
                value: formatScore(producer.score.value, producer.score.maxValue),
              },
              { label: "Contract status", value: contract.status.replaceAll("_", " ") },
              { label: "Monitoring", value: title(contract.monitoring.satellite) },
              { label: "Insurance", value: title(contract.insurance.status) },
            ]}
          />
        </Section>
        <Section title="Monitoring">
          <DataList
            items={[
              { label: "Satellite monitoring", value: title(contract.monitoring.satellite) },
              { label: "Soil moisture", value: title(contract.monitoring.soilMoisture) },
            ]}
          />
        </Section>
        <Section title="Insurance">
          <DataList
            items={[
              { label: "Insurance", value: title(contract.insurance.status) },
              { label: "Provider", value: contract.insurance.provider },
              { label: "Policy ref", value: contract.insurance.policyRef },
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

function title(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
