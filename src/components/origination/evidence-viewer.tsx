"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { ViewerItem } from "@/components/origination/viewer-items";

export function EvidenceViewer({ items }: { items: ViewerItem[] }) {
  const t = useTranslations("origination");
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [zoom, setZoom] = useState(1);
  const active = useMemo(
    () => items.find((item) => item.id === activeId) ?? items[0],
    [activeId, items],
  );
  if (!active) {
    return <p className="text-sm text-straw">{t("noDocument")}</p>;
  }
  const src = `/api/origination/file?bucket=${encodeURIComponent(active.bucket)}&path=${encodeURIComponent(active.objectPath)}`;
  const isImage = active.mimeType.startsWith("image/");

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2 overflow-x-auto">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setActiveId(item.id);
              setZoom(1);
            }}
            className={
              item.id === active.id
                ? "label-caps text-harvest"
                : "label-caps text-straw hover:text-harvest"
            }
          >
            {item.versionLabel ? `${item.versionLabel} · ` : null}
            {item.title}
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" size="xs" variant="ghost" onClick={() => setZoom(1)}>
          {t("fitWidth")}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setZoom((value) => Math.min(3, value + 0.25))}>
          {t("zoomIn")}
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}>
          {t("zoomOut")}
        </Button>
      </div>
      <div className="max-h-[70vh] overflow-auto border border-harvest/20 bg-ink">
        {isImage ? (
          // Signed/authorized stream; next/image is not used for private storage.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            src={src}
            className="h-auto w-full origin-top"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
          />
        ) : (
          <iframe
            title={active.title}
            src={src}
            className="min-h-[70vh] w-full bg-ink"
            style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
          />
        )}
      </div>
    </div>
  );
}
