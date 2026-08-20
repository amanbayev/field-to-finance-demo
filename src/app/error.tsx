"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="max-w-lg">
      <p className="text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
        {t("system")}
      </p>
      <h1 className="mt-2 font-heading text-3xl">{t("unableTitle")}</h1>
      <p className="mt-3 text-sm text-muted-foreground">{t("unableBody")}</p>
      <Button className="mt-6" onClick={reset}>
        {t("retry")}
      </Button>
    </div>
  );
}
