import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { registerAction } from "@/app/auth/actions";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
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
    <div className="mx-auto max-w-md">
      <PageHeader
        eyebrow={productName}
        title={t("registerTitle")}
        description={t("registerIntro")}
      />
      {!configured ? (
        <p className="mb-4 text-sm text-muted-foreground">{t("notConfigured")}</p>
      ) : null}
      {params.error ? (
        <p className="mb-4 text-sm text-destructive">
          {lookupMessage(t, `errors.${params.error}`)}
        </p>
      ) : null}
      <form action={registerAction} className="space-y-4">
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
            autoComplete="new-password"
            minLength={10}
            required
          />
        </div>
        <div>
          <label className="label-caps mb-1 block" htmlFor="confirm">
            {t("confirmPassword")}
          </label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="accept" className="mt-1 size-3.5" required />
          {t("acceptTerms")}
        </label>
        <Button className="w-full" disabled={!configured}>
          {t("createAccount")}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link className="text-foreground underline-offset-4 hover:underline" href="/login">
          {t("signIn")}
        </Link>
      </p>
    </div>
  );
}
