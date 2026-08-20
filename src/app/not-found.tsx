import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("errors");

  return (
    <div className="max-w-lg">
      <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        {t("notFound")}
      </p>
      <h1 className="mt-2 font-heading text-3xl">{t("recordTitle")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("recordBody")}</p>
      <Button className="mt-6" render={<Link href="/" />}>
        {t("returnDashboard")}
      </Button>
    </div>
  );
}
