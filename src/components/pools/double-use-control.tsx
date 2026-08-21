import { getTranslations } from "next-intl/server";
import { StatusBadge } from "@/components/shared/status-badge";
import { Panel, PanelBody } from "@/components/shared/panel";

export async function DoubleUseControl() {
  const t = await getTranslations("pools");

  return (
    <Panel>
      <PanelBody className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("doubleUse.title")}
          </p>
          <StatusBadge value="PROTECTED_ON_CHAIN" />
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("doubleUse.body")}
        </p>
      </PanelBody>
    </Panel>
  );
}
