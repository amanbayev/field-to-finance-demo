import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/shared/page-header";
import { DeskFigure, DeskLedger, DeskRow, deskIndex } from "@/components/surface/desk-stage";
import { requirePermission } from "@/lib/auth/guard";
import { loadAdminOverview } from "@/services/admin-service";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("system") };
}

export default async function AdminPage() {
  await requirePermission("admin.access");
  const t = await getTranslations("admin");
  const tNav = await getTranslations("nav");
  const overview = await loadAdminOverview();

  return (
    <div>
      <PageHeader
        eyebrow={t("eyebrow")}
        title={tNav("system")}
        description={t("intro")}
        photo="/media/grain-kernel-macro.png"
        figure={
          <DeskFigure
            label={t("pendingRequests")}
            value={String(overview?.pendingRequests ?? 0)}
            meta={[
              { label: t("users"), value: String(overview?.users ?? "—") },
              { label: t("organizations"), value: String(overview?.organizations ?? "—") },
            ]}
          />
        }
      />
      <DeskLedger>
        <DeskRow href="/admin/users" index={deskIndex(0)} title={t("users")} />
        <DeskRow href="/admin/organizations" index={deskIndex(1)} title={t("organizations")} />
        <DeskRow href="/admin/access" index={deskIndex(2)} title={t("access")} />
        <DeskRow href="/admin/requests" index={deskIndex(3)} title={t("roleRequests")} />
        <DeskRow href="/admin/demo-personas" index={deskIndex(4)} title={t("demoPersonas")} />
        <DeskRow href="/audit" index={deskIndex(5)} title={t("audit")} />
      </DeskLedger>
    </div>
  );
}
