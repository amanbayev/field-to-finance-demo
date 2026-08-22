import { getTranslations } from "next-intl/server";
import { onboardingAction } from "@/app/auth/actions";
import { requireActor } from "@/lib/auth/load-actor";
import { AuthorizationError } from "@/domain/identity";
import { redirect, unauthorized } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  try {
    await requireActor();
  } catch (error) {
    if (error instanceof AuthorizationError && error.code === "unauthenticated") {
      unauthorized();
    }
    redirect("/login?reason=not_configured");
  }
  const t = await getTranslations("onboarding");
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title={t("title")} description={t("intro")} />
      {params.error ? (
        <p className="mb-4 text-sm text-destructive">{t("error")}</p>
      ) : null}
      <form action={onboardingAction} className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("question")}</legend>
          {(
            [
              ["PRODUCER", t("producer")],
              ["INVESTOR", t("investor")],
              ["TRADER", t("trader")],
              ["OTHER", t("other")],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input type="radio" name="intent" value={value} required />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-muted-foreground">{t("requestNote")}</p>
        <div>
          <label className="label-caps mb-1 block" htmlFor="organizationName">
            {t("organizationName")}
          </label>
          <Input id="organizationName" name="organizationName" />
        </div>
        <Button>{t("submit")}</Button>
      </form>
    </div>
  );
}
