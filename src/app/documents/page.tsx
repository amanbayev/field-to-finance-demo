import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DataList } from "@/components/shared/data-list";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import { requirePermission } from "@/lib/auth/guard";
import { listContractsForActor } from "@/services/access-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("documentsTitle") };
}

export default async function DocumentsPage() {
  const actor = await requirePermission("contracts.manage.own");
  const t = await getTranslations("workspace");
  const items = listContractsForActor(actor);

  return (
    <div>
      <PageHeader
        eyebrow={t("documentsEyebrow")}
        title={t("documentsTitle")}
        description={t("documentsIntro")}
      />
      {items.map(({ contract }) => (
        <PageSection key={contract.id} title={contract.id}>
          <DataList
            items={[
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
        </PageSection>
      ))}
    </div>
  );
}
