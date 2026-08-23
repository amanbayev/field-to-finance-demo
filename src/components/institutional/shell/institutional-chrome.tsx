import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AccountMenu } from "@/components/identity/account-menu";
import { PersonaSwitcher } from "@/components/identity/persona-switcher";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { AppShell } from "@/components/institutional/shell/app-shell";
import { WorkspaceSwitcher } from "@/components/institutional/shell/workspace-switcher";
import { actorCan, PERSONA_GROUPS, principalCan, type ActorContext, type PersonaGroup } from "@/domain/identity";
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

export async function InstitutionalChrome({
  actor,
  children,
  identityMode = "session",
  organizationName,
  banner,
  layout = "app",
}: {
  actor: ActorContext;
  children: ReactNode;
  identityMode?: "session" | "review";
  organizationName?: string;
  banner?: ReactNode;
  layout?: "app" | "document";
}) {
  const t = await getTranslations("institutional");
  const tIdentity = await getTranslations("identity");
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

  const canSwitchPersonas =
    identityMode === "session" && principalCan(actor, "admin.demo_personas");
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
  const workspaceName =
    organizationName ??
    actor.effective.organization?.name ??
    actor.principal.organization?.name ??
    legalOperatorName;

  const helpHref =
    actorCan(actor, "market.read") || actorCan(actor, "regulator.read")
      ? "/architecture"
      : undefined;

  return (
    <AppShell
      layout={layout}
      banner={banner}
      navItems={navItems}
      workspace={
        <WorkspaceSwitcher
          label={t("workspaceLabel")}
          organizationName={workspaceName}
          roleLabel={roleLabel}
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
          {identityMode === "review" ? (
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-[#0B5D3B] text-[11px] font-medium text-white">
                {initials(roleLabel)}
              </span>
              <div className="hidden min-w-0 lg:block">
                <p className="truncate text-[13px] font-medium">{t("reviewIdentity")}</p>
                <p className="truncate text-[11px] text-muted-foreground">{roleLabel}</p>
              </div>
            </div>
          ) : (
            <AccountMenu
              compact
              initials={initials(actor.principal.displayName)}
              principalName={actor.principal.displayName}
              principalEmail={actor.principal.email}
              organizationName={workspaceName}
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
          )}
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
