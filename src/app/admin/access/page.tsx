import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { MembershipManager } from "@/components/admin/membership-manager";
import { PageHeader } from "@/components/shared/page-header";
import { lookupMessage } from "@/i18n/t-dynamic";
import { requirePermission } from "@/lib/auth/guard";
import { loadAdminOrganizations, loadAdminUsers } from "@/services/admin-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("accessTitle") };
}

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePermission("admin.roles");
  const t = await getTranslations("workspace");
  const tAdmin = await getTranslations("admin");
  const params = await searchParams;
  const [users, organizations] = await Promise.all([
    loadAdminUsers(),
    loadAdminOrganizations(),
  ]);

  return (
    <div>
      <PageHeader
        eyebrow={tAdmin("eyebrow")}
        title={t("accessTitle")}
        description={t("accessIntro")}
      />
      {params.error ? (
        <p className="mb-4 text-sm text-destructive">
          {lookupMessage(tAdmin, `errors.${params.error}`)}
        </p>
      ) : null}
      <MembershipManager users={users} organizations={organizations} />
    </div>
  );
}
