"use client";

import { useTranslations } from "next-intl";
import {
  exitPersonaAction,
  logoutAction,
  openAdminConsoleAction,
  switchOrganizationAction,
} from "@/app/auth/actions";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
import { cn } from "@/lib/utils";

export function AccountMenu({
  initials,
  principalName,
  principalEmail,
  organizationName,
  roleLabel,
  memberships,
  activeOrganizationId,
  canOpenAdmin,
  isImpersonating,
  compact,
}: {
  initials: string;
  principalName: string;
  principalEmail: string | null;
  organizationName?: string | null;
  roleLabel: string;
  memberships: Array<{ id: string; organizationId: string; name: string }>;
  activeOrganizationId?: string | null;
  canOpenAdmin: boolean;
  isImpersonating: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("identity");
  return (
    <details className="relative shrink-0">
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-muted/60 [&::-webkit-details-marker]:hidden",
        )}
      >
        {compact ? null : (
          <div className="hidden min-w-0 text-right md:block">
            <p className="truncate text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
              {t("signedIn")}
            </p>
            <p className="max-w-[10rem] truncate text-xs font-medium">{principalName}</p>
            <p className="max-w-[10rem] truncate text-[10px] tracking-wide text-muted-foreground">
              {roleLabel}
            </p>
          </div>
        )}
        <div
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary text-[11px] font-medium text-primary-foreground"
        >
          {initials}
        </div>
        <span className="text-[10px] text-muted-foreground" aria-hidden>
          ▼
        </span>
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-56 border border-border bg-card p-2 shadow-sm">
        <p className="truncate px-1 text-xs font-medium">{principalName}</p>
        {organizationName ? (
          <p className="truncate px-1 text-[10px] text-muted-foreground">{organizationName}</p>
        ) : null}
        <p className="mb-2 truncate px-1 text-[10px] tracking-wide text-muted-foreground uppercase">
          {roleLabel}
        </p>
        {memberships.length > 1 ? (
          <form action={switchOrganizationAction} className="mb-2">
            <select
              name="organizationId"
              defaultValue={activeOrganizationId ?? memberships[0]?.organizationId}
              className="h-7 w-full rounded-sm border border-input bg-background px-1 text-[11px]"
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              aria-label={t("organizationSwitcher")}
            >
              {memberships.map((membership) => (
                <option key={membership.id} value={membership.organizationId}>
                  {membership.name}
                </option>
              ))}
            </select>
          </form>
        ) : null}
        {canOpenAdmin ? (
          <form action={openAdminConsoleAction}>
            <FormSubmitButton
              variant="ghost"
              size="xs"
              className="w-full justify-start"
              pendingLabel={t("administration")}
            >
              {t("administration")}
            </FormSubmitButton>
          </form>
        ) : null}
        {isImpersonating ? (
          <form action={exitPersonaAction}>
            <FormSubmitButton
              variant="ghost"
              size="xs"
              className="w-full justify-start"
              pendingLabel={t("exitPersona")}
            >
              {t("exitPersona")}
            </FormSubmitButton>
          </form>
        ) : null}
        <form action={logoutAction}>
          <FormSubmitButton
            variant="ghost"
            size="xs"
            className="w-full justify-start"
            pendingLabel={t("logout")}
          >
            {t("logout")}
          </FormSubmitButton>
        </form>
        {principalEmail ? <span className="sr-only">{principalEmail}</span> : null}
      </div>
    </details>
  );
}
