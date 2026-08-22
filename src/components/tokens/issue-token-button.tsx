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
    <div className="flex flex-wrap gap-2">
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex w-fit" />}>
          <Button disabled variant="outline" size="sm">
            {t("issue")}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{t("issueTooltip")}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex w-fit" />}>
          <Button disabled variant="outline" size="sm">
            {t("burn")}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{t("burnTooltip")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
