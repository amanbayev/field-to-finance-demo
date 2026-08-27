import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MainNav, MobileNav } from "@/components/layout/main-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { AccountMenu } from "@/components/identity/account-menu";
import { PersonaSwitcher } from "@/components/identity/persona-switcher";
import { BrandMark } from "@/components/layout/brand-mark";
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
  const actor = await getOptionalActor().catch(() => null);
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
      compact
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
  const personaSwitcher = canSwitchPersonas ? (
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

  if (actor) {
    return (
      <header className="sticky top-0 z-50 h-12 overflow-x-clip border-b border-harvest/20 bg-ink/92 backdrop-blur-md">
        <div className="flex h-12 min-w-0 items-center gap-2 px-2 sm:gap-3 sm:px-5">
          <MobileNav groups={groups} sessionSlot={personaSwitcherMobile} />
          <BrandMark
            compact
            fullName={t("surface.protocol")}
            shortName={t("surface.wordmark")}
          />
          <div className="ml-auto flex min-w-0 items-center gap-1.5 overflow-x-clip sm:gap-3">
            <div className="hidden min-w-0 max-w-[16rem] lg:block">
              {personaSwitcher}
            </div>
            <LanguageSwitcher />
            {account}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-50 border-b border-harvest/20 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1440px] items-center gap-2 px-5 py-3 sm:gap-3 sm:px-10 lg:gap-6">
        <MobileNav
          groups={groups}
          sessionSlot={
            <div className="flex flex-col gap-2" data-auth-cta>
              <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/login" />}>
                {t("identity.login")}
              </Button>
              <Button size="sm" nativeButton={false} render={<Link href="/register" />}>
                {t("identity.register")}
              </Button>
            </div>
          }
        />
        <div className="min-w-0 flex-1 lg:flex-none">
          <BrandMark
            compact
            fullName={t("surface.protocol")}
            shortName={t("surface.wordmark")}
          />
        </div>
        <div className="hidden min-w-0 flex-1 lg:block" data-guest-nav>
          <MainNav groups={groups} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageSwitcher />
          <div className="hidden items-center gap-3 lg:flex" data-auth-cta>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/login" />}>
              {t("identity.login")}
            </Button>
            <Button size="sm" nativeButton={false} render={<Link href="/register" />}>
              {t("identity.register")}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
