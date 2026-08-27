import { getTranslations } from "next-intl/server";
import { contactEmail, legalOperatorName, productName } from "@/lib/navigation";

export async function SiteFooter() {
  const t = await getTranslations();

  return (
    <footer className="site-footer mt-auto border-t border-border bg-ink/80">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4 px-5 py-8 sm:flex-row sm:items-start sm:justify-between sm:px-10">
        <div className="space-y-1">
          <p className="font-heading text-sm tracking-tight text-bone">
            {productName}
          </p>
          <p className="text-[11px] text-straw">
            {t("brand.operatedBy", { operator: legalOperatorName })}
          </p>
          <p className="text-[11px] text-straw">{t("brand.protocolNote")}</p>
        </div>
        <div className="max-w-2xl space-y-1">
          <p className="text-xs leading-relaxed text-straw">
            {t("footer.disclaimer")}
          </p>
          <p className="text-[11px] text-straw/80">
            {t("footer.contact")}:{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="text-bone underline-offset-4 transition-colors duration-150 ease-out hover:text-harvest hover:underline"
            >
              {contactEmail}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
