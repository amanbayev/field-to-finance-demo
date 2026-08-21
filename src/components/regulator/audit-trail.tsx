"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { StickyCell, StickyHead } from "@/components/shared/sticky-cell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AppLocale } from "@/i18n/config";
import { formatLedgerTimestamp } from "@/lib/format";
import { entityHref } from "@/lib/entity";
import { lookupMessage } from "@/i18n/t-dynamic";
import { explorerTxUrl, shortenKey } from "@/adapters/blockchain";
import type { AuditEvent } from "@/domain";

export function AuditTrail({ events }: { events: AuditEvent[] }) {
  const t = useTranslations("audit");
  const locale = useLocale() as AppLocale;

  if (events.length === 0) {
    return (
      <p className="border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  }

  return (
    <Table className="min-w-[48rem]">
      <TableHeader>
        <TableRow>
          <StickyHead>{t("columns.timestamp")}</StickyHead>
          <TableHead>{t("columns.event")}</TableHead>
          <TableHead>{t("columns.entity")}</TableHead>
          <TableHead>{t("columns.actor")}</TableHead>
          <TableHead>{t("columns.status")}</TableHead>
          <TableHead>{t("columns.reference")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((event) => {
          const href = entityHref(event.relatedEntityType, event.relatedEntityId);
          const source = event.source ?? "application";
          const reference = event.reference ?? event.id;
          return (
            <TableRow key={event.id}>
              <StickyCell className="font-tabular text-xs text-muted-foreground">
                {formatLedgerTimestamp(event.timestamp, locale)} UTC
              </StickyCell>
              <TableCell className="font-medium">
                {lookupMessage(t, `${event.eventKey}.title`)}
              </TableCell>
              <TableCell>
                {event.relatedEntityId ? (
                  href ? (
                    <Link
                      href={href}
                      className="font-tabular text-xs text-primary hover:underline"
                    >
                      {event.relatedEntityId}
                    </Link>
                  ) : (
                    <span className="font-tabular text-xs">
                      {event.relatedEntityId}
                    </span>
                  )
                ) : (
                  t("notRecorded")
                )}
              </TableCell>
              <TableCell>
                {source === "blockchain"
                  ? t("actorSolanaDevnet")
                  : t("actorApplication")}
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-1.5 text-xs">
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-primary"
                  />
                  {source === "blockchain"
                    ? t("kindBlockchain")
                    : t("kindApplication")}
                </span>
              </TableCell>
              <TableCell className="font-tabular text-xs">
                {source === "blockchain" ? (
                  <a
                    href={explorerTxUrl(reference)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {shortenKey(reference, 6)}
                  </a>
                ) : (
                  <span className="uppercase">{reference}</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
