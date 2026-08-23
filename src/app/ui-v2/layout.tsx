import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AccountMenu } from "@/components/identity/account-menu";
import { PersonaSwitcher } from "@/components/identity/persona-switcher";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { AppShell } from "@/components/institutional/shell/app-shell";
import { WorkspaceSwitcher } from "@/components/institutional/shell/workspace-switcher";
import { actorCan, PERSONA_GROUPS, principalCan, type PersonaGroup } from "@/domain/identity";
import { getOptionalActor } from "@/lib/auth/load-actor";
import { marketCoreNavForActor } from "@/lib/institutional/nav";
import { INSTRUMENT_SHELL_TABS } from "@/lib/institutional/tabs";
import { legalOperatorName } from "@/lib/navigation";
import { loadDemoPersonasAdmin } from "@/services/admin-service";
import { lookupMessage } from "@/i18n/t-dynamic";

function personaGroupKey(value: string): PersonaGroup {
  return (PERSONA_GROUPS as readonly string[]).includes(value)
    ? (value as PersonaGroup)
    : "system";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

export default async function UiV2Layout({ children }: { children: ReactNode }) {
  const t = await getTranslations("institutional");
  const tIdentity = await getTranslations("identity");
  let actor = null;
  try {
    actor = await getOptionalActor();
  } catch {
    actor = null;
  }

  if (!actor) {
    return (
      <div data-shell="institutional" className="min-h-dvh bg-background p-6 text-foreground">
        {children}
      </div>
    );
  }

  const labels = {
    overview: t("nav.overview"),
    markets: t("nav.markets"),
    instruments: t("nav.instruments"),
    clearing: t("nav.clearing"),
    registry: t("nav.registry"),
    participants: t("nav.participants"),
    compliance: t("nav.compliance"),
    supervision: t("nav.supervision"),
    reports: t("nav.reports"),
  };
  const navItems = marketCoreNavForActor(actor, labels);
  const tabLabels = Object.fromEntries(
    INSTRUMENT_SHELL_TABS.map((tab) => [tab, lookupMessage(t, `tabs.${tab}`)]),
  ) as Record<(typeof INSTRUMENT_SHELL_TABS)[number], string>;

  const canSwitchPersonas = principalCan(actor, "admin.demo_personas");
  const demoPersonas = canSwitchPersonas ? await loadDemoPersonasAdmin() : [];
  const personaOptions = demoPersonas.map((persona) => ({
    id: persona.id,
    displayName: persona.display_name,
    groupKey: personaGroupKey(persona.group_key),
    status: persona.status,
  }));
  const orgNameById = new Map(
    (actor.principal.organizations ?? []).map((organization) => [
      organization.id,
      organization.name,
    ]),
  );
  const principalRoleId = actor.effective.roleId ?? actor.principal.roleIds[0];
  const roleLabel = principalRoleId
    ? lookupMessage(tIdentity, `roles.${principalRoleId}`)
    : tIdentity("noRole");
  const organizationName =
    actor.effective.organization?.name ??
    actor.principal.organization?.name ??
    legalOperatorName;

  const helpHref =
    actorCan(actor, "market.read") || actorCan(actor, "regulator.read")
      ? "/architecture"
      : undefined;

  return (
    <AppShell
      navItems={navItems}
      workspace={
        <WorkspaceSwitcher
          organizationName={organizationName}
          roleLabel={roleLabel}
          operatorLabel={t("operatedBy", { operator: legalOperatorName })}
        />
      }
      labels={{
        brandTitle: t("brandTitle"),
        brandSubtitle: t("brandSubtitle"),
        collapse: t("collapse"),
        expand: t("expand"),
        searchPlaceholder: t("searchPlaceholder"),
        searchEmpty: t("searchEmpty"),
        shortcut: t("searchShortcut"),
        helpLabel: t("help"),
        alertsLabel: t("alerts"),
        alertsEmpty: t("alertsEmpty"),
        menuLabel: t("menu"),
        tabLabels,
        helpHref,
      }}
      topTrailing={
        <div className="flex items-center gap-2">
          {canSwitchPersonas ? (
            <div className="hidden max-w-[14rem] lg:block">
              <PersonaSwitcher
                compact
                selectId="personaIdInstitutional"
                currentPersonaId={actor.demoPersona?.id}
                isImpersonating={Boolean(actor.isImpersonating)}
                personas={personaOptions}
              />
            </div>
          ) : null}
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>
          <AccountMenu
            compact
            initials={initials(actor.principal.displayName)}
            principalName={actor.principal.displayName}
            principalEmail={actor.principal.email}
            organizationName={organizationName}
            roleLabel={roleLabel}
            canOpenAdmin={principalCan(actor, "admin.access")}
            isImpersonating={actor.isImpersonating}
            memberships={actor.principal.memberships
              .filter((membership) => membership.status === "ACTIVE")
              .map((membership) => ({
                id: membership.id,
                organizationId: membership.organizationId,
                name: orgNameById.get(membership.organizationId) ?? membership.organizationId,
              }))}
            activeOrganizationId={actor.principal.organization?.id}
          />
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
