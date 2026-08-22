import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MainNav, MobileNav } from "@/components/layout/main-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { AccountMenu } from "@/components/identity/account-menu";
import { PersonaSwitcher } from "@/components/identity/persona-switcher";
import { legalOperatorName, productName } from "@/lib/navigation";
import { getOptionalActor } from "@/lib/auth/load-actor";
import { navGroupsForActor } from "@/lib/auth/nav";
import { PERSONA_GROUPS, principalCan, type PersonaGroup } from "@/domain/identity";
import { loadDemoPersonasAdmin } from "@/services/admin-service";
import { Button } from "@/components/ui/button";

function personaGroupKey(value: string): PersonaGroup {
  return (PERSONA_GROUPS as readonly string[]).includes(value)
    ? (value as PersonaGroup)
    : "system";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "U";
}

export async function SiteHeader() {
  const t = await getTranslations();
  let actor = null;
  try {
    actor = await getOptionalActor();
  } catch {
    actor = null;
  }
  const groups = navGroupsForActor(actor);
  const canSwitchPersonas = Boolean(
    actor && principalCan(actor, "admin.demo_personas"),
  );
  const demoPersonas = canSwitchPersonas ? await loadDemoPersonasAdmin() : [];
  const personaOptions = demoPersonas.map((persona) => ({
    id: persona.id,
    displayName: persona.display_name,
    groupKey: personaGroupKey(persona.group_key),
    status: persona.status,
  }));
  const orgNameById = new Map(
    (actor?.principal.organizations ?? []).map((organization) => [
      organization.id,
      organization.name,
    ]),
  );
  const principalRoleId = actor?.principal.roleIds[0];
  const account = actor ? (
    <AccountMenu
      initials={initials(actor.principal.displayName)}
      principalName={actor.principal.displayName}
      principalEmail={actor.principal.email}
      organizationName={actor.principal.organization?.name}
      roleLabel={
        principalRoleId
          ? t(`identity.roles.${principalRoleId}`)
          : t("identity.noRole")
      }
      canOpenAdmin={principalCan(actor, "admin.access")}
      isImpersonating={actor.isImpersonating}
      memberships={actor.principal.memberships
        .filter((membership) => membership.status === "ACTIVE")
        .map((membership) => ({
          id: membership.id,
          organizationId: membership.organizationId,
          name:
            orgNameById.get(membership.organizationId) ??
            membership.organizationId,
        }))}
      activeOrganizationId={actor.principal.organization?.id}
    />
  ) : null;
  const personaSwitcherDesktop = canSwitchPersonas ? (
    <PersonaSwitcher
      compact
      selectId="personaIdDesktop"
      currentPersonaId={actor?.demoPersona?.id}
      isImpersonating={Boolean(actor?.isImpersonating)}
      personas={personaOptions}
    />
  ) : null;
  const personaSwitcherMobile = canSwitchPersonas ? (
    <PersonaSwitcher
      compact
      selectId="personaIdMobile"
      currentPersonaId={actor?.demoPersona?.id}
      isImpersonating={Boolean(actor?.isImpersonating)}
      personas={personaOptions}
    />
  ) : null;

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between gap-3 bg-primary px-4 py-1 text-primary-foreground sm:px-6">
        <p className="text-[10px] font-medium tracking-[0.16em] uppercase">
          {t("header.badge")}
        </p>
        <p className="hidden text-[10px] tracking-wide sm:block">
          {t("header.phase")}
        </p>
      </div>

      {actor ? (
        <>
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 sm:px-6">
            <MobileNav groups={groups} />
            <div className="min-w-0 shrink-0">
              <Link
                href="/"
                className="text-sm font-medium leading-none text-foreground sm:text-base"
              >
                {productName}
              </Link>
              <p className="mt-0.5 hidden text-[10px] leading-snug text-muted-foreground sm:block">
                {t("brand.operatedBy", { operator: legalOperatorName })}
              </p>
            </div>
            <div className="hidden min-w-0 flex-1 lg:block">
              {personaSwitcherDesktop}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <div className="hidden lg:block">
                <LanguageSwitcher />
              </div>
              {account}
            </div>
          </div>
          {personaSwitcherMobile ? (
            <div className="border-t border-border px-4 py-2 lg:hidden sm:px-6">
              {personaSwitcherMobile}
            </div>
          ) : null}
          <div className="hidden border-t border-border bg-muted/30 lg:block">
            <div className="mx-auto max-w-7xl px-4 py-1 sm:px-6">
              <MainNav groups={groups} />
            </div>
          </div>
        </>
      ) : (
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6">
          <MobileNav groups={groups} />
          <div className="min-w-0 shrink-0">
            <Link
              href="/"
              className="text-sm font-medium leading-none text-foreground sm:text-base"
            >
              {productName}
            </Link>
            <p className="mt-1 hidden max-w-xs text-[10px] leading-snug tracking-wide text-muted-foreground uppercase sm:block">
              {t("brand.operatedBy", { operator: legalOperatorName })}
              {" · "}
              {t("brand.subtitle")}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <MainNav groups={groups} />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <Button variant="ghost" size="sm" render={<Link href="/login" />}>
              {t("identity.login")}
            </Button>
            <Button size="sm" render={<Link href="/register" />}>
              {t("identity.register")}
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
