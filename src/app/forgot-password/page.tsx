import { getTranslations } from "next-intl/server";
import { forgotPasswordAction } from "@/app/auth/actions";
import { AuthDeskClosed, AuthScreen } from "@/components/surface/auth-screen";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
import { Input } from "@/components/ui/input";
import { isAuthConfigured } from "@/lib/auth/env";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const configured = isAuthConfigured();

  return (
    <AuthScreen>
      {configured ? (
        <div>
          <h1 className="font-heading text-3xl text-bone">{t("forgotTitle")}</h1>
          <p className="mt-2 text-sm leading-relaxed text-straw">{t("forgotIntro")}</p>
          {params.sent ? <p className="mt-4 text-sm text-bone">{t("resetSent")}</p> : null}
          <form action={forgotPasswordAction} className="mt-8 space-y-4">
            <div>
              <label className="label-caps mb-1.5 block" htmlFor="email">
                {t("email")}
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                className="h-11 bg-card/80"
              />
            </div>
            <FormSubmitButton className="h-11 w-full" pendingLabel={t("working")}>
              {t("sendReset")}
            </FormSubmitButton>
          </form>
        </div>
      ) : (
        <AuthDeskClosed />
      )}
    </AuthScreen>
  );
}
