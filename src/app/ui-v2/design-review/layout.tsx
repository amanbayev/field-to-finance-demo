import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { InstitutionalChrome } from "@/components/institutional/shell/institutional-chrome";
import { assertDesignReviewEnabled } from "@/lib/institutional/design-review";
import {
  designReviewActor,
  designReviewWorkspaceName,
} from "@/lib/institutional/wheat-overview-fixture";

export const dynamic = "force-dynamic";

export default async function DesignReviewLayout({ children }: { children: ReactNode }) {
  assertDesignReviewEnabled();
  const t = await getTranslations("institutional");
  return (
    <InstitutionalChrome
      actor={designReviewActor()}
      identityMode="review"
      organizationName={designReviewWorkspaceName()}
      layout="document"
      banner={t("designReviewBanner")}
    >
      {children}
    </InstitutionalChrome>
  );
}
