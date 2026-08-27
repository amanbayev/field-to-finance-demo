import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { registerAction } from "@/app/auth/actions";
import { AuthDeskClosed, AuthScreen } from "@/components/surface/auth-screen";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
import { Input } from "@/components/ui/input";
import { isAuthConfigured } from "@/lib/auth/env";
import { lookupMessage } from "@/i18n/t-dynamic";
import { productName } from "@/lib/navigation";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const configured = isAuthConfigured();

  return (
    <AuthScreen>
      {configured ? (
        <div>
          <p className="label-caps text-harvest">{productName}</p>
          <h1 className="mt-3 font-heading text-3xl text-bone">{t("registerTitle")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-straw">{t("registerIntro")}</p>
          {params.error ? (
            <p className="mt-4 text-sm text-destructive">
              {lookupMessage(t, `errors.${params.error}`)}
            </p>
          ) : null}
          <form action={registerAction} className="mt-8 space-y-4">
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
                autoComplete="new-password"
                minLength={10}
                required
                className="h-11 bg-card/80"
              />
            </div>
            <div>
              <label className="label-caps mb-1.5 block" htmlFor="confirm">
                {t("confirmPassword")}
              </label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={10}
                required
                className="h-11 bg-card/80"
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-straw">
              <input type="checkbox" name="accept" className="mt-1 size-3.5" required />
              {t("acceptTerms")}
            </label>
            <FormSubmitButton className="h-11 w-full" pendingLabel={t("working")}>
              {t("createAccount")}
            </FormSubmitButton>
          </form>
          <p className="mt-5 text-sm text-straw">
            {t("hasAccount")}{" "}
            <Link
              className="text-bone underline-offset-4 hover:text-harvest hover:underline"
              href="/login"
            >
              {t("signIn")}
            </Link>
          </p>
        </div>
      ) : (
        <AuthDeskClosed />
      )}
    </AuthScreen>
  );
}
