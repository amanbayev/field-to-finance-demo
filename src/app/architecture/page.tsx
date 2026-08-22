import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DistributionDiagram } from "@/components/market-core/distribution-diagram";
import { LevelsPanel } from "@/components/market-core/levels-panel";
import { PlatformOperatorStack } from "@/components/market-core/platform-operator-stack";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { requirePermission } from "@/lib/auth/guard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("marketCore");
  return { title: t("architectureTitle") };
}

export default async function ArchitecturePage() {
  await requirePermission("market.read", "regulator.read");
  const t = await getTranslations("marketCore");

  return (
    <div>
      <PageHeader
        eyebrow={t("levelPlatform")}
        title={t("architectureTitle")}
        description={t("architectureIntro")}
      />
      <PlatformOperatorStack />
      <div className="mt-8">
        <LevelsPanel
          title={t("levelsTitle")}
          levels={[
            { label: t("levelPlatform"), detail: t("platformNotToken") },
            { label: t("levelProtocol"), detail: t("notInstrument") },
            { label: t("levelInstrument"), detail: t("notProtocol") },
          ]}
        />
      </div>
      <PageSection title={t("architectureTitle")}>
        <DistributionDiagram
          title={t("architectureTitle")}
          coreLabel={t("marketCore")}
          channels={[t("channelDirect"), t("channelRetail"), t("channelApi")]}
          coreLayers={[
            t("coreAdmission"),
            t("coreOrders"),
            t("coreMatching"),
            t("coreClearing"),
            t("coreRegistry"),
            t("coreCompliance"),
            t("coreAudit"),
          ]}
          settlementLayers={[
            t("settleBank"),
            t("settleBinance"),
            t("settleStablecoin"),
            t("settleOther"),
          ]}
          notes={[t("noteBinance"), t("noteRetail"), t("noteNoSdk"), t("retailFuture")]}
        />
      </PageSection>
    </div>
  );
}
