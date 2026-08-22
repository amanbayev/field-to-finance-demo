import { getTranslations } from "next-intl/server";
import { forgotPasswordAction } from "@/app/auth/actions";
import { PageHeader } from "@/components/shared/page-header";
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
    <div className="mx-auto max-w-md">
      <PageHeader title={t("forgotTitle")} description={t("forgotIntro")} />
      {!configured ? (
        <p className="mb-4 text-sm text-muted-foreground">{t("notConfigured")}</p>
      ) : null}
      {params.sent ? <p className="mb-4 text-sm">{t("resetSent")}</p> : null}
      <form action={forgotPasswordAction} className="space-y-4">
        <div>
          <label className="label-caps mb-1 block" htmlFor="email">
            {t("email")}
          </label>
          <Input id="email" name="email" type="email" required disabled={!configured} />
        </div>
        <FormSubmitButton className="w-full" disabled={!configured} pendingLabel={t("working")}>
          {t("sendReset")}
        </FormSubmitButton>
      </form>
    </div>
  );
}
