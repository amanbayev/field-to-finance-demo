"use client";

import { useTranslations } from "next-intl";
import { demoPersonas } from "@/data/identity/demo-catalog";
import { assumePersonaAction } from "@/app/auth/actions";

const GROUP_ORDER = ["system", "control", "agro", "market"] as const;

export function PersonaSwitcher({
  currentPersonaId,
  isImpersonating,
  personas,
  compact = false,
  selectId = "personaId",
}: {
  currentPersonaId?: string | null;
  isImpersonating: boolean;
  personas?: Array<{
    id: string;
    displayName: string;
    groupKey: "system" | "control" | "agro" | "market";
    status?: "ACTIVE" | "INACTIVE";
  }>;
  compact?: boolean;
  selectId?: string;
}) {
  const t = useTranslations("identity");
  const source = personas?.length ? personas : demoPersonas();
  const grouped = GROUP_ORDER.map((group) => ({
    group,
    items: source.filter(
      (persona) =>
        persona.groupKey === group &&
        (persona.status ?? "ACTIVE") === "ACTIVE",
    ),
  }));

  return (
    <form
      action={assumePersonaAction}
      className="min-w-0"
      key={currentPersonaId ?? "none"}
    >
      <div className={compact ? "flex min-w-0 items-center gap-2" : "min-w-0"}>
        {isImpersonating ? (
          <span className="shrink-0 text-[10px] font-medium tracking-[0.16em] text-primary uppercase">
            {t("demoModeBanner")}
          </span>
        ) : (
          <label
            className={
              compact
                ? "sr-only"
                : "label-caps text-muted-foreground"
            }
            htmlFor={selectId}
          >
            {t("demoMode")}
          </label>
        )}
        <select
          id={selectId}
          name="personaId"
          defaultValue={currentPersonaId ?? ""}
          className="h-7 w-full min-w-0 max-w-[18rem] truncate rounded-sm border border-input bg-background px-2 text-xs"
          onChange={(event) => {
            if (event.currentTarget.value) {
              event.currentTarget.form?.requestSubmit();
            }
          }}
          aria-label={t("demoMode")}
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
      </div>
    </form>
  );
}
