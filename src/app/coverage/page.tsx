import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { actorCan } from "@/domain/identity";
import { CoverageConsole } from "@/components/coverage/coverage-console";
import { MarketCoreContextHeader } from "@/components/market-core/market-core-context-header";
import { requirePermission } from "@/lib/auth/guard";
import { protocolModuleTrail } from "@/lib/market-core/hierarchy";
import { getAssetProtocol } from "@/services/market-core-service";

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

  // Protocol context for this module, from the registry record.

  const f2fProtocol = getAssetProtocol("F2F") ?? null;

  const tNav = await getTranslations("nav");
  const tCoreNav = await getTranslations("marketCore");


  return (
    <div>
      <MarketCoreContextHeader
        level="PROTOCOL"
        trail={protocolModuleTrail(f2fProtocol, tNav("coverage"))}
        translate={tCoreNav}
        eyebrow={t("coverageEyebrow")}
        title={t("coverageTitle")}
        description={t("coverageIntro")}
      />
      <CoverageConsole roleCopyKey={roleCopyKey} />
    </div>
  );
}
