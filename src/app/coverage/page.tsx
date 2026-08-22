import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { actorCan } from "@/domain/identity";
import { CoverageConsole } from "@/components/coverage/coverage-console";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workspace");
  return { title: t("coverageTitle") };
}

export default async function CoveragePage() {
  const actor = await requirePermission(
    "scas.read",
    "regulator.read",
    "issuance.manage",
  );
  const t = await getTranslations("workspace");
  const roleCopyKey = actorCan(actor, "regulator.read")
    ? ("coverageRoleRegulator" as const)
    : actorCan(actor, "scas.read")
      ? ("coverageRoleScas" as const)
      : actorCan(actor, "issuance.manage")
        ? ("coverageRoleIssuer" as const)
        : undefined;

  return (
    <div>
      <PageHeader
        eyebrow={t("coverageEyebrow")}
        title={t("coverageTitle")}
        description={t("coverageIntro")}
      />
      <CoverageConsole roleCopyKey={roleCopyKey} />
    </div>
  );
}
