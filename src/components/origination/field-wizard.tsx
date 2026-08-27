"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { createFieldAction } from "@/app/fields/actions";
import { FormSubmitButton } from "@/components/identity/form-submit-button";
import { Button } from "@/components/ui/button";

const CROPS = ["Wheat", "Barley"] as const;
const REGIONS = [
  "Akmola",
  "Kostanay",
  "North Kazakhstan",
  "Pavlodar",
  "Karaganda",
  "Aktobe",
  "Abai",
  "Turkistan",
] as const;

function LandStepActions({ onBack }: { onBack: () => void }) {
  const t = useTranslations("origination");
  const { pending } = useFormStatus();
  return (
    <div className="flex flex-wrap gap-3 pt-2">
      <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
        {t("back")}
      </Button>
      <FormSubmitButton pendingLabel={t("savingDraft")}>{t("saveDraft")}</FormSubmitButton>
    </div>
  );
}

export function FieldWizard({ createRequestId }: { createRequestId: string }) {
  const t = useTranslations("origination");
  const tCatalog = useTranslations("catalog");
  const [step, setStep] = useState<1 | 2>(1);

  return (
    <form action={createFieldAction} className="mx-auto max-w-2xl">
      <input type="hidden" name="createRequestId" value={createRequestId} />
      <ol className="mb-8 flex gap-8 border-b border-harvest/20 pb-3">
        <li className={step === 1 ? "text-harvest" : "text-straw"}>
          <span className="label-caps">01</span> {t("stepIdentity")}
        </li>
        <li className={step === 2 ? "text-harvest" : "text-straw"}>
          <span className="label-caps">02</span> {t("stepLand")}
        </li>
      </ol>

      <fieldset className={step === 1 ? "grid gap-5" : "hidden"}>
        <label className="grid gap-2">
          <span className="label-caps">{t("internalRef")}</span>
          <input required name="name" className="desk-control h-10 w-full" />
        </label>
        <label className="grid gap-2">
          <span className="label-caps">{t("season")}</span>
          <select name="season" defaultValue="2027" className="desk-control h-10 w-full">
            <option value="2026">2026</option>
            <option value="2027">2027</option>
            <option value="2028">2028</option>
          </select>
        </label>
        <label className="grid gap-2">
          <span className="label-caps">{t("crop")}</span>
          <select name="crop" defaultValue="Wheat" className="desk-control h-10 w-full">
            {CROPS.map((crop) => (
              <option key={crop} value={crop}>
                {tCatalog(`crops.${crop}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="pt-2">
          <Button type="button" onClick={() => setStep(2)}>
            {t("continue")}
          </Button>
        </div>
      </fieldset>

      <fieldset className={step === 2 ? "grid gap-5" : "hidden"}>
        <p className="text-sm text-straw">{t("wizardLead")}</p>
        <label className="grid gap-2">
          <span className="label-caps">{t("cadastre")}</span>
          <input required name="cadastreNumber" className="desk-control h-10 w-full font-tabular" />
        </label>
        <label className="grid gap-2">
          <span className="label-caps">{t("declaredArea")}</span>
          <input name="declaredAreaHa" type="number" min="0" step="0.1" className="desk-control h-10 w-full font-tabular" />
        </label>
        <label className="grid gap-2">
          <span className="label-caps">{t("region")}</span>
          <select name="region" className="desk-control h-10 w-full">
            <option value="" />
            {REGIONS.map((region) => (
              <option key={region} value={region}>
                {tCatalog(`regions.${region}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2">
          <span className="label-caps">{t("district")}</span>
          <input name="district" className="desk-control h-10 w-full" />
        </label>
        <LandStepActions onBack={() => setStep(1)} />
      </fieldset>
    </form>
  );
}
