"use client";

import { useTranslations } from "next-intl";
import {
  logoutAction,
  switchOrganizationAction,
} from "@/app/auth/actions";
import { Button } from "@/components/ui/button";

export function AccountMenu({
  initials,
  principalName,
  principalEmail,
  organizationName,
  roleLabel,
  memberships,
  activeOrganizationId,
}: {
  initials: string;
  principalName: string;
  principalEmail: string | null;
  organizationName?: string | null;
  roleLabel: string;
  memberships: Array<{ id: string; organizationId: string; name: string }>;
  activeOrganizationId?: string | null;
}) {
  const t = useTranslations("identity");
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="truncate text-xs font-medium">{principalName}</p>
        <p className="truncate text-[10px] text-muted-foreground">
          {organizationName}
        </p>
        <p className="truncate text-[10px] tracking-wide text-muted-foreground uppercase">
          {roleLabel}
        </p>
      </div>
      <div
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary text-[11px] font-medium text-primary-foreground"
      >
        {initials}
      </div>
      <div className="flex flex-col items-end gap-1">
        {memberships.length > 1 ? (
          <form action={switchOrganizationAction}>
            <select
              name="organizationId"
              defaultValue={activeOrganizationId ?? memberships[0]?.organizationId}
              className="h-7 max-w-[10rem] rounded-sm border border-input bg-background px-1 text-[11px]"
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
        <form action={logoutAction}>
          <Button variant="ghost" size="xs">
            {t("logout")}
          </Button>
        </form>
      </div>
      {principalEmail ? (
        <span className="sr-only">{principalEmail}</span>
      ) : null}
    </div>
  );
}
