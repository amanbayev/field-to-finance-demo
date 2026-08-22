import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCell, MetricStrip } from "@/components/shared/metric-strip";
import { requirePermission } from "@/lib/auth/guard";
import { loadAdminOverview } from "@/services/admin-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

export default async function AdminPage() {
  await requirePermission("admin.access");
  const t = await getTranslations("admin");
  const overview = await loadAdminOverview();

  return (
    <div>
      <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("intro")} />
      <MetricStrip className="sm:grid-cols-4">
        <MetricCell label={t("users")} value={String(overview?.users ?? 0)} />
        <MetricCell label={t("organizations")} value={String(overview?.organizations ?? 0)} />
        <MetricCell label={t("memberships")} value={String(overview?.memberships ?? 0)} />
        <MetricCell label={t("pendingRequests")} value={String(overview?.pendingRequests ?? 0)} />
      </MetricStrip>
      <ul className="mt-6 space-y-2 text-sm">
        <li><Link href="/admin/users" className="hover:underline">{t("users")}</Link></li>
        <li><Link href="/admin/organizations" className="hover:underline">{t("organizations")}</Link></li>
        <li><Link href="/admin/requests" className="hover:underline">{t("roleRequests")}</Link></li>
        <li><Link href="/admin/demo-personas" className="hover:underline">{t("demoPersonas")}</Link></li>
        <li><Link href="/admin/audit" className="hover:underline">{t("audit")}</Link></li>
      </ul>
    </div>
  );
}
