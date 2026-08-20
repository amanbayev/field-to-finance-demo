"use client";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function IssueTokenButton() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex w-fit" />}
      >
        <Button disabled>Issue on Solana</Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        Solana issuance will be activated in the next development phase.
      </TooltipContent>
    </Tooltip>
  );
}
