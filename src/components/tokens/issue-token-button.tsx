"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function IssueTokenButton() {
  const t = useTranslations("tokens");

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex w-fit" />}>
        <Button disabled variant="outline" size="sm">
          {t("issue")}
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{t("issueTooltip")}</TooltipContent>
    </Tooltip>
  );
}
