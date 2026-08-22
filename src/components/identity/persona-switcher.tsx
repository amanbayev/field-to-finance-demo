"use client";

import { useTranslations } from "next-intl";
import { demoPersonas } from "@/data/identity/demo-catalog";
import {
  assumePersonaAction,
  exitPersonaAction,
} from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

const GROUP_ORDER = ["system", "control", "agro", "market"] as const;

export function PersonaSwitcher({
  currentPersonaId,
  isImpersonating,
}: {
  currentPersonaId?: string | null;
  isImpersonating: boolean;
}) {
  const t = useTranslations("identity");
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: demoPersonas().filter((persona) => persona.groupKey === group),
  }));

  return (
    <form action={assumePersonaAction} className="min-w-0">
      <label className="label-caps text-muted-foreground" htmlFor="personaId">
        {t("demoMode")}
      </label>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <select
          id="personaId"
          name="personaId"
          defaultValue={currentPersonaId ?? ""}
          className="h-8 max-w-[16rem] min-w-0 flex-1 truncate rounded-sm border border-input bg-background px-2 text-xs"
          onChange={(event) => {
            if (event.currentTarget.value) {
              event.currentTarget.form?.requestSubmit();
            }
          }}
        >
          <option value="">{t("choosePersona")}</option>
          {grouped.map((entry) => (
            <optgroup key={entry.group} label={t(`groups.${entry.group}`)}>
              {entry.items.map((persona) => (
                <option key={persona.id} value={persona.id}>
                  {persona.displayName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {isImpersonating ? (
          <Button formAction={exitPersonaAction} variant="outline" size="sm">
            {t("exitPersona")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
