import { getTranslations } from "next-intl/server";
import { onboardingAction } from "@/app/auth/actions";
import { requireActor } from "@/lib/auth/load-actor";
import { AuthorizationError } from "@/domain/identity";
import { redirect, unauthorized } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { PageSection } from "@/components/shared/page-section";
import { DeskNote } from "@/components/surface/desk-stage";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
import { Input } from "@/components/ui/input";
import { lookupMessage } from "@/i18n/t-dynamic";
import { presentOnboardingReadiness } from "@/lib/market-core/eligibility-presentation";
import { explainOnboardingMarketReadinessForOrganization } from "@/services/market-core-service";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  let actor;
  try {
    actor = await requireActor();
  } catch (error) {
    if (error instanceof AuthorizationError && error.code === "unauthenticated") {
      unauthorized();
    }
    redirect("/login?reason=not_configured");
  }
  const t = await getTranslations("onboarding");
  const tElig = await getTranslations("eligibility");
  const params = await searchParams;
  const organizationId = actor.effective.organization?.id ?? null;
  const readiness = organizationId
    ? presentOnboardingReadiness(
        explainOnboardingMarketReadinessForOrganization(organizationId),
      )
    : null;

  return (
    <div>
      <PageHeader
        eyebrow={t("title")}
        title={t("title")}
        description={t("intro")}
        photo="/media/hero-harvest-dusk.png"
      />
      {params.error ? (
        <p className="mb-4 text-sm text-destructive">{t("error")}</p>
      ) : null}
      <form action={onboardingAction} className="max-w-lg space-y-6">
        <fieldset className="space-y-3">
          <legend className="label-caps text-harvest">{t("question")}</legend>
          {(
            [
              ["PRODUCER", t("producer")],
              ["INVESTOR", t("investor")],
              ["TRADER", t("trader")],
              ["OTHER", t("other")],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-bone">
              <input type="radio" name="intent" value={value} required />
              {label}
            </label>
          ))}
        </fieldset>
        <DeskNote>{t("requestNote")}</DeskNote>
        <div>
          <label className="label-caps mb-1 block" htmlFor="organizationName">
            {t("organizationName")}
          </label>
          <Input id="organizationName" name="organizationName" />
        </div>
        <FormSubmitButton pendingLabel={t("submit")}>{t("submit")}</FormSubmitButton>
      </form>
      <PageSection title={t("sequenceTitle")}>
        <ol className="max-w-2xl list-decimal space-y-2 pl-5 text-sm leading-relaxed text-straw">
          <li>{t("stepRequest")}</li>
          <li>{t("stepMembership")}</li>
          <li>{t("stepParticipant")}</li>
          <li>{t("stepAssessment")}</li>
          <li>{t("stepNewOrder")}</li>
        </ol>
        <div className="mt-4 max-w-2xl space-y-2 text-sm leading-relaxed text-straw">
          <p>{t("noEligibilityGranted")}</p>
          <p>{t("noPermissionsGranted")}</p>
          <p>{t("instrumentSpecific")}</p>
          <p>{t("noDatePromised")}</p>
          <p>{t("notRegulatory")}</p>
        </div>
      </PageSection>
      {readiness ? (
        <PageSection title={tElig("readinessTitle")}>
          <DeskNote className="mb-4">
            {lookupMessage(tElig, readiness.onboardingDoesNotGrantEligibilityKey)}
          </DeskNote>
          <dl className="max-w-lg space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt>{tElig("readinessHasOrganization")}</dt>
              <dd>{readiness.hasOrganization ? tElig("yes") : tElig("readinessMissing")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{tElig("readinessHasMembership")}</dt>
              <dd>{readiness.hasMembership ? tElig("yes") : tElig("readinessMissing")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{tElig("readinessHasParticipant")}</dt>
              <dd>{readiness.hasParticipant ? tElig("yes") : tElig("readinessMissing")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{tElig("readinessHasAssessment")}</dt>
              <dd>{readiness.hasAssessment ? tElig("yes") : tElig("readinessMissing")}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{tElig("columnInstrument")}</dt>
              <dd>
                {readiness.instrumentSymbol ?? lookupMessage(tElig, "summaryUnavailable")}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{tElig("labelInstrumentEligibility")}</dt>
              <dd>{lookupMessage(tElig, readiness.eligibilityStateKey)}</dd>
            </div>
          </dl>
        </PageSection>
      ) : (
        <DeskNote className="mt-8">{tElig("fixtureDisclaimer")}</DeskNote>
      )}
    </div>
  );
}
