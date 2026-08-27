import { getTranslations } from "next-intl/server";
import type { ActorContext } from "@/domain/identity";

export async function DemoModeBanner({ actor }: { actor: ActorContext }) {
  if (!actor.isImpersonating || !actor.demoPersona) {
    return null;
  }
  const t = await getTranslations("identity");
  return (
    <div className="border-b border-harvest/20 bg-harvest/10 px-5 py-2 sm:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
        <p className="text-[10px] font-medium tracking-[0.16em] text-primary uppercase">
          {t("demoModeBanner")}
        </p>
        <p className="text-sm text-foreground">
          {t("viewingAs", { name: actor.demoPersona.displayName })}
        </p>
      </div>
    </div>
  );
}
