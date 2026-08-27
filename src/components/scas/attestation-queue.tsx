"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyCell, StickyHead } from "@/components/shared/sticky-cell";
import {
  DeskLedger,
  DeskNote,
  DeskSplit,
  deskIndex,
} from "@/components/surface/desk-stage";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ScasAttestation, ScasAttestationStatus } from "@/domain";
import type { AppLocale } from "@/i18n/config";
import { lookupMessage } from "@/i18n/t-dynamic";
import { formatLedgerTimestamp } from "@/lib/format";

function subjectHref(item: ScasAttestation): string | null {
  if (item.subjectType === "contract") {
    return `/contracts/${item.subjectId}`;
  }
  if (item.subjectType === "pool") {
    return `/pools/${item.subjectId}`;
  }
  return null;
}

export function AttestationQueue({
  initialItems,
}: {
  initialItems: ScasAttestation[];
}) {
  const t = useTranslations("scas");
  const locale = useLocale() as AppLocale;
  const [items, setItems] = useState(initialItems);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const pending = useMemo(
    () => items.filter((item) => item.status === "PENDING_ATTESTATION"),
    [items],
  );
  const closed = useMemo(
    () => items.filter((item) => item.status !== "PENDING_ATTESTATION"),
    [items],
  );

  function attest(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "ATTESTED" satisfies ScasAttestationStatus,
              attestedAt: new Date().toISOString(),
              operatorNote: undefined,
            }
          : item,
      ),
    );
    setRejectingId(null);
  }

  function reject(id: string) {
    setItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              status: "REJECTED" satisfies ScasAttestationStatus,
              attestedAt: new Date().toISOString(),
              operatorNote: rejectNote.trim() || undefined,
            }
          : item,
      ),
    );
    setRejectingId(null);
    setRejectNote("");
  }

  return (
    <div>
      <DeskNote className="mb-8">{t("queueDemoNote")}</DeskNote>
      <QueueTable
        title={t("pendingQueue")}
        emptyTitle={t("noPendingTitle")}
        emptyBody={t("noPending")}
        items={pending}
        locale={locale}
        rejectingId={rejectingId}
        rejectNote={rejectNote}
        onRejectNote={setRejectNote}
        onStartReject={(id) => {
          setRejectingId(id);
          setRejectNote("");
        }}
        onCancelReject={() => {
          setRejectingId(null);
          setRejectNote("");
        }}
        onAttest={attest}
        onReject={reject}
      />
      <div className="mt-12">
        <QueueTable
          title={t("closedQueue")}
          emptyTitle={t("noClosedTitle")}
          emptyBody={t("noClosed")}
          items={closed}
          locale={locale}
        />
      </div>
    </div>
  );
}

function QueueTable({
  title,
  emptyTitle,
  emptyBody,
  items,
  locale,
  rejectingId,
  rejectNote,
  onRejectNote,
  onStartReject,
  onCancelReject,
  onAttest,
  onReject,
}: {
  title: string;
  emptyTitle: string;
  emptyBody: string;
  items: ScasAttestation[];
  locale: AppLocale;
  rejectingId?: string | null;
  rejectNote?: string;
  onRejectNote?: (value: string) => void;
  onStartReject?: (id: string) => void;
  onCancelReject?: () => void;
  onAttest?: (id: string) => void;
  onReject?: (id: string) => void;
}) {
  const t = useTranslations("scas");

  if (items.length === 0) {
    return (
      <EmptyState kicker={title} title={emptyTitle} body={emptyBody} />
    );
  }

  return (
    <div>
      <p className="mb-4 label-caps text-harvest">{title}</p>
      <DeskSplit
        compact={
          <DeskLedger>
            {items.map((item, index) => {
              const href = subjectHref(item);
              return (
                <li key={item.id} className="py-4">
                  <p className="flex items-baseline gap-3">
                    <span className="font-tabular text-[10px] tracking-widest text-straw">
                      {deskIndex(index)}
                    </span>
                    <span className="label-caps text-straw">
                      {lookupMessage(t, `kinds.${item.kind}`)}
                    </span>
                  </p>
                  <p className="mt-1 font-tabular text-base text-bone">{item.id}</p>
                  <p className="mt-1 text-sm text-straw">
                    {href ? (
                      <Link href={href} className="font-tabular text-harvest hover:underline">
                        {item.subjectId}
                      </Link>
                    ) : (
                      <span className="font-tabular">{item.subjectId}</span>
                    )}
                    <span className="mx-2 text-harvest/40">·</span>
                    {lookupMessage(t, `evidence.${item.evidenceKey}`)}
                  </p>
                  {item.operatorNote ? (
                    <p className="mt-1 text-sm text-bone">
                      {t("operatorNote")}: {item.operatorNote}
                    </p>
                  ) : null}
                  {onAttest &&
                  onReject &&
                  onStartReject &&
                  item.status === "PENDING_ATTESTATION" ? (
                    <div className="mt-3">
                      {rejectingId === item.id ? (
                        <div className="flex flex-col gap-2">
                          <textarea
                            value={rejectNote}
                            onChange={(event) => onRejectNote?.(event.target.value)}
                            rows={2}
                            className="desk-control h-auto min-h-16 w-full px-3 py-2"
                            placeholder={t("rejectPlaceholder")}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() => onReject(item.id)}
                            >
                              {t("reject")}
                            </Button>
                            <Button size="xs" variant="ghost" onClick={onCancelReject}>
                              {t("cancel")}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button size="xs" onClick={() => onAttest(item.id)}>
                            {t("attest")}
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => onStartReject(item.id)}
                          >
                            {t("reject")}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 font-tabular text-sm text-harvest">
                      {item.attestedAt
                        ? formatLedgerTimestamp(item.attestedAt, locale)
                        : "—"}
                    </p>
                  )}
                </li>
              );
            })}
          </DeskLedger>
        }
        wide={
          <Table className="min-w-[48rem]">
            <TableHeader>
              <TableRow>
                <StickyHead>{t("columns.id")}</StickyHead>
                <TableHead>{t("columns.kind")}</TableHead>
                <TableHead>{t("columns.subject")}</TableHead>
                <TableHead>{t("columns.evidence")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.time")}</TableHead>
                {onAttest ? <TableHead>{t("columns.action")}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const href = subjectHref(item);
                return (
                  <TableRow key={item.id}>
                    <StickyCell className="font-tabular text-xs">{item.id}</StickyCell>
                    <TableCell>{lookupMessage(t, `kinds.${item.kind}`)}</TableCell>
                    <TableCell>
                      {href ? (
                        <Link
                          href={href}
                          className="font-tabular text-xs text-harvest hover:underline"
                        >
                          {item.subjectId}
                        </Link>
                      ) : (
                        <span className="font-tabular text-xs">{item.subjectId}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[16rem] text-xs text-straw">
                      {lookupMessage(t, `evidence.${item.evidenceKey}`)}
                      {item.operatorNote ? (
                        <span className="mt-1 block text-bone">
                          {t("operatorNote")}: {item.operatorNote}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={item.status} />
                    </TableCell>
                    <TableCell className="font-tabular text-xs text-straw">
                      {item.attestedAt
                        ? formatLedgerTimestamp(item.attestedAt, locale)
                        : "—"}
                    </TableCell>
                    {onAttest && onReject && onStartReject ? (
                      <TableCell>
                        {item.status === "PENDING_ATTESTATION" ? (
                          rejectingId === item.id ? (
                            <div className="flex min-w-[12rem] flex-col gap-2">
                              <textarea
                                value={rejectNote}
                                onChange={(event) =>
                                  onRejectNote?.(event.target.value)
                                }
                                rows={2}
                                className="desk-control h-auto min-h-16 w-full px-3 py-2"
                                placeholder={t("rejectPlaceholder")}
                              />
                              <div className="flex gap-1">
                                <Button
                                  size="xs"
                                  variant="destructive"
                                  onClick={() => onReject(item.id)}
                                >
                                  {t("reject")}
                                </Button>
                                <Button
                                  size="xs"
                                  variant="ghost"
                                  onClick={onCancelReject}
                                >
                                  {t("cancel")}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-1">
                              <Button size="xs" onClick={() => onAttest(item.id)}>
                                {t("attest")}
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                onClick={() => onStartReject(item.id)}
                              >
                                {t("reject")}
                              </Button>
                            </div>
                          )
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        }
      />
    </div>
  );
}
