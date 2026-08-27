"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  exitPersonaAction,
  logoutAction,
  openAdminConsoleAction,
  switchOrganizationAction,
} from "@/app/auth/actions";
import { buttonVariants } from "@/components/ui/button";
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
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass = cn(buttonVariants({ variant: "ghost", size: "xs" }), "w-full justify-start");

  return (
    <div className="relative shrink-0" ref={rootRef} suppressHydrationWarning>
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 hover:bg-muted/60"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
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
        {compact ? null : (
          <span className="text-[10px] text-muted-foreground" aria-hidden>
            ▼
          </span>
        )}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-30 mt-1 w-56 max-w-[calc(100vw-1rem)] border border-harvest/25 bg-background p-2"
        >
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
          <Link href="/help" role="menuitem" className={itemClass}>
            {t("help")}
          </Link>
          {canOpenAdmin ? (
            <form action={openAdminConsoleAction}>
              <button type="submit" role="menuitem" className={itemClass}>
                {t("administration")}
              </button>
            </form>
          ) : null}
          {isImpersonating ? (
            <form action={exitPersonaAction}>
              <button type="submit" role="menuitem" className={itemClass}>
                {t("exitPersona")}
              </button>
            </form>
          ) : null}
          <form action={logoutAction}>
            <button type="submit" role="menuitem" className={itemClass}>
              {t("logout")}
            </button>
          </form>
          {principalEmail ? <span className="sr-only">{principalEmail}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
