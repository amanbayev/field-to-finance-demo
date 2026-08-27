import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import type { DocumentItem } from "@/lib/institutional/load-overview";

export function DocumentList({
  items,
  labels,
  empty,
}: {
  items: DocumentItem[];
  labels: {
    docInstrumentTerms: string;
    docCoverageSnapshot: string;
    docIssuance: string;
    docPrimaryPlacement: string;
    docAuditRegister: string;
    record: string;
    workspace: string;
  };
  empty: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const title =
          item.titleKey in labels
            ? labels[item.titleKey as keyof typeof labels]
            : item.titleKey;
        const kindLabel = item.kind === "workspace" ? labels.workspace : labels.record;
        const detailIsKind = item.detail === "record" || item.detail === "workspace";
        const body = (
          <span className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-start gap-2.5">
              <FileText className="mt-0.5 size-4 shrink-0 text-[#7B857F]" aria-hidden />
              <span>
                <span className="block text-sm font-medium">{title}</span>
                {detailIsKind ? (
                  <span className="mt-0.5 block text-[11px] text-[#7B857F]">{kindLabel}</span>
                ) : (
                  <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                    {item.detail}
                  </span>
                )}
              </span>
            </span>
            {item.href ? (
              <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-[#7B857F]" aria-hidden />
            ) : null}
          </span>
        );
        return (
          <li key={item.id}>
            {item.href ? (
              <Link href={item.href} className="block rounded-md hover:bg-[#F7F8F5]">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}
