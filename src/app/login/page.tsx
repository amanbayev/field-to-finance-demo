import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { loginAction } from "@/app/auth/actions";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isAuthConfigured } from "@/lib/auth/env";
import { safeReturnTo } from "@/lib/auth/return-to";
import { lookupMessage } from "@/i18n/t-dynamic";
import { productName } from "@/lib/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reason?: string; returnTo?: string }>;
}) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const configured = isAuthConfigured();
  const returnTo = safeReturnTo(params.returnTo);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        eyebrow={productName}
        title={t("loginTitle")}
        description={t("loginIntro")}
      />
      {!configured ? (
        <p className="mb-4 text-sm text-muted-foreground">{t("notConfigured")}</p>
      ) : null}
      {params.reason ? (
        <p className="mb-4 text-sm text-destructive">
          {lookupMessage(t, `reasons.${params.reason}`)}
        </p>
      ) : null}
      {params.error ? (
        <p className="mb-4 text-sm text-destructive">
          {lookupMessage(t, `errors.${params.error}`)}
        </p>
      ) : null}
      <form action={loginAction} className="space-y-4">
        <input type="hidden" name="returnTo" value={returnTo} />
        <div>
          <label className="label-caps mb-1 block" htmlFor="email">
            {t("email")}
          </label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label-caps mb-1 block" htmlFor="password">
            {t("password")}
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="remember" className="size-3.5" />
          {t("remember")}
        </label>
        <Button className="w-full" disabled={!configured}>
          {t("signIn")}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link className="text-foreground underline-offset-4 hover:underline" href="/register">
          {t("registerLink")}
        </Link>
      </p>
      <p className="mt-2 text-sm">
        <Link className="text-muted-foreground hover:text-foreground" href="/forgot-password">
          {t("forgot")}
        </Link>
      </p>
    </div>
  );
}
