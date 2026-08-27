import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { loginAction } from "@/app/auth/actions";
import { AuthDeskClosed, AuthScreen } from "@/components/surface/auth-screen";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
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
    <AuthScreen>
      {configured ? (
        <div>
          <p className="label-caps text-harvest">{productName}</p>
          <h1 className="mt-3 font-heading text-3xl text-bone">{t("loginTitle")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-straw">{t("loginIntro")}</p>
          {params.reason ? (
            <p className="mt-4 text-sm text-destructive">
              {lookupMessage(t, `reasons.${params.reason}`)}
            </p>
          ) : null}
          {params.error ? (
            <p className="mt-4 text-sm text-destructive">
              {lookupMessage(t, `errors.${params.error}`)}
            </p>
          ) : null}
          <form action={loginAction} className="mt-8 space-y-4">
            <input type="hidden" name="returnTo" value={returnTo} />
            <div>
              <label className="label-caps mb-1.5 block" htmlFor="email">
                {t("email")}
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="h-11 bg-card/80"
              />
            </div>
            <div>
              <label className="label-caps mb-1.5 block" htmlFor="password">
                {t("password")}
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-11 bg-card/80"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-straw">
              <input type="checkbox" name="remember" className="size-3.5" />
              {t("remember")}
            </label>
            <FormSubmitButton className="h-11 w-full" pendingLabel={t("working")}>
              {t("signIn")}
            </FormSubmitButton>
          </form>
          <p className="mt-5 text-sm text-straw">
            {t("noAccount")}{" "}
            <Link
              className="text-bone underline-offset-4 hover:text-harvest hover:underline"
              href="/register"
            >
              {t("registerLink")}
            </Link>
          </p>
          <p className="mt-2 text-sm">
            <Link className="text-straw hover:text-bone" href="/forgot-password">
              {t("forgot")}
            </Link>
          </p>
        </div>
      ) : (
        <AuthDeskClosed />
      )}
    </AuthScreen>
  );
}
