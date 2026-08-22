import { getTranslations } from "next-intl/server";
import { forgotPasswordAction } from "@/app/auth/actions";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title={t("forgotTitle")} description={t("forgotIntro")} />
      {params.sent ? <p className="mb-4 text-sm">{t("resetSent")}</p> : null}
      <form action={forgotPasswordAction} className="space-y-4">
        <div>
          <label className="label-caps mb-1 block" htmlFor="email">
            {t("email")}
          </label>
          <Input id="email" name="email" type="email" required />
        </div>
        <Button className="w-full">{t("sendReset")}</Button>
      </form>
    </div>
  );
}
