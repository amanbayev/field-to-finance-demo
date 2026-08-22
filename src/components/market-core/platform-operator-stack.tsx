import { getTranslations } from "next-intl/server";
import { LEGAL_OPERATOR } from "@/domain/market-core";
import { SpvStack } from "@/components/market-core/spv-stack";

export async function PlatformOperatorStack() {
  const t = await getTranslations("marketCore");

  return (
    <div>
      <SpvStack
        title={t("operatorStackTitle")}
        rows={[
          { label: t("legalLicensedOperator"), value: LEGAL_OPERATOR },
          { label: t("operates"), value: t("platformNeutralName") },
          { label: t("contains"), value: t("marketCore") },
          { label: t("supports"), value: t("assetProtocols") },
          { label: t("oneProtocol"), value: t("agricultureProtocolName") },
        ]}
      />
      <p className="mt-3 text-xs text-muted-foreground">{t("operatorStackNote")}</p>
    </div>
  );
}
