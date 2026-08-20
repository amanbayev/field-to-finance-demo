import { getTranslations } from "next-intl/server";
import { contactEmail, productName } from "@/lib/navigation";

export async function SiteFooter() {
  const t = await getTranslations("footer");

  return (
    <footer className="mt-auto border-t border-border bg-card">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <p className="text-xs font-medium tracking-wide text-foreground">
          {productName}
        </p>
        <div className="max-w-3xl space-y-1">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("disclaimer")}
          </p>
          <p className="text-[11px] text-muted-foreground/80">
            {t("contact")}:{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="underline-offset-2 hover:text-foreground hover:underline"
            >
              {contactEmail}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
