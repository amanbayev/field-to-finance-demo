import type { ReactNode } from "react";
import { InstitutionalChrome } from "@/components/institutional/shell/institutional-chrome";
import { getOptionalActor } from "@/lib/auth/load-actor";

export default async function UiV2InstrumentsLayout({ children }: { children: ReactNode }) {
  let actor = null;
  try {
    actor = await getOptionalActor();
  } catch {
    actor = null;
  }

  if (!actor) {
    return children;
  }

  return <InstitutionalChrome actor={actor}>{children}</InstitutionalChrome>;
}
