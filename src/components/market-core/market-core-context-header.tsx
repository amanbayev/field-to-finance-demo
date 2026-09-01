import type { ReactNode } from "react";
import { PlatformBreadcrumb } from "@/components/market-core/platform-breadcrumb";
import { PageHeader } from "@/components/shared/page-header";
import { lookupMessage } from "@/i18n/t-dynamic";
import {
  HIERARCHY_LEVEL_KEYS,
  type HierarchyCrumb,
  type HierarchyLevel,
} from "@/lib/market-core/hierarchy";

/**
 * Shared hierarchy context for Market Core screens.
 *
 * Renders the level the screen sits on plus a localized breadcrumb trail, so
 * pages declare their position in the product hierarchy instead of each
 * hand-assembling a breadcrumb array. Server Component: it renders text and
 * links only.
 */
export function MarketCoreContextHeader({
  level,
  trail,
  title,
  description,
  translate,
  photo,
  photoAlt,
  photoPosition,
  kenBurnsOrigin,
  asOfLabel,
  figure,
  eyebrow,
  className,
}: {
  level: HierarchyLevel;
  trail: HierarchyCrumb[];
  title: ReactNode;
  description?: ReactNode;
  /** `useTranslations`/`getTranslations` scope holding the marketCore keys. */
  translate: (key: never) => string;
  photo?: string;
  photoAlt?: string;
  photoPosition?: string;
  kenBurnsOrigin?: "center" | "left" | "right" | "bottom";
  asOfLabel?: string;
  figure?: ReactNode;
  className?: string;
  /** Overrides the level label when a screen needs a more specific eyebrow. */
  eyebrow?: string;
}) {
  // The crumb union guarantees exactly one of labelKey / label, so there is no
  // empty-string fallback here.
  const items = trail.map((crumb) => ({
    href: crumb.href,
    label:
      crumb.labelKey !== undefined
        ? lookupMessage(translate, crumb.labelKey)
        : crumb.label,
  }));

  return (
    <>
      <PlatformBreadcrumb items={items} />
      <PageHeader
        eyebrow={eyebrow ?? lookupMessage(translate, HIERARCHY_LEVEL_KEYS[level])}
        title={title}
        description={description}
        photo={photo}
        photoAlt={photoAlt}
        photoPosition={photoPosition}
        kenBurnsOrigin={kenBurnsOrigin}
        asOfLabel={asOfLabel}
        figure={figure}
        className={className}
      />
    </>
  );
}
