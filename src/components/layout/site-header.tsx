import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { blockchainProvider } from "@/services/providers";
import { MainNav, MobileNav } from "@/components/layout/main-nav";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { AccountMenu } from "@/components/identity/account-menu";
import { PersonaSwitcher } from "@/components/identity/persona-switcher";
import { DemoModeBanner } from "@/components/identity/demo-mode-banner";
import { productName } from "@/lib/navigation";
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
  const network = await blockchainProvider.getNetworkStatus();
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
  const orgNameById = new Map(
    (actor?.principal.organizations ?? []).map((organization) => [
      organization.id,
      organization.name,
    ]),
  );

  return (
    <header className="border-b border-border bg-card">
      <div className="flex items-center justify-between gap-3 bg-primary px-4 py-1 text-primary-foreground sm:px-6">
        <p className="text-[10px] font-medium tracking-[0.16em] uppercase">
          {t("header.badge")}
        </p>
        <div className="flex items-center gap-4">
          <p className="hidden text-[10px] tracking-wide sm:block">
            {t("header.phase")}
          </p>
          <LanguageSwitcher variant="onPrimary" />
        </div>
      </div>
      {actor ? <DemoModeBanner actor={actor} /> : null}
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 sm:px-6">
        <MobileNav groups={groups} />
        <div className="min-w-0 shrink-0">
          <p className="text-sm font-medium leading-none text-foreground sm:text-base">
            {productName}
          </p>
          <p className="mt-1 hidden max-w-xs text-[10px] leading-snug tracking-wide text-muted-foreground uppercase sm:block">
            {t("brand.subtitle")}
          </p>
        </div>
        <div className="min-w-0 flex-1">
          <MainNav groups={groups} />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {canSwitchPersonas ? (
            <div className="hidden min-w-0 xl:block">
              <PersonaSwitcher
                currentPersonaId={actor?.demoPersona?.id}
                isImpersonating={Boolean(actor?.isImpersonating)}
                personas={demoPersonas.map((persona) => ({
                  id: persona.id,
                  displayName: persona.display_name,
                  groupKey: personaGroupKey(persona.group_key),
                  status: persona.status,
                }))}
              />
            </div>
          ) : null}
          {actor ? (
            <AccountMenu
              initials={initials(actor.principal.displayName)}
              principalName={actor.principal.displayName}
              principalEmail={actor.principal.email}
              organizationName={actor.principal.organization?.name}
              roleLabel={
                actor.principal.roleIds[0] ?? t("identity.noRole")
              }
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
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" render={<Link href="/login" />}>
                {t("identity.login")}
              </Button>
              <Button size="sm" render={<Link href="/register" />}>
                {t("identity.register")}
              </Button>
            </div>
          )}
          <div className="hidden shrink-0 items-end gap-4 border-l border-border pl-4 text-right 2xl:flex">
            <div>
              <p className="label-caps">{t("header.network")}</p>
              <p className="text-xs font-medium">{network.network}</p>
            </div>
            <div>
              <p className="label-caps">{t("header.system")}</p>
              <p className="text-xs font-medium text-primary">
                {network.connected
                  ? t("header.connected")
                  : t("header.disconnected")}
              </p>
            </div>
          </div>
        </div>
      </div>
      {canSwitchPersonas ? (
        <div className="mx-auto max-w-7xl px-4 pb-3 xl:hidden sm:px-6">
          <PersonaSwitcher
            currentPersonaId={actor?.demoPersona?.id}
            isImpersonating={Boolean(actor?.isImpersonating)}
            personas={demoPersonas.map((persona) => ({
              id: persona.id,
              displayName: persona.display_name,
                  groupKey: personaGroupKey(persona.group_key),
              status: persona.status,
            }))}
          />
        </div>
      ) : null}
    </header>
  );
}
