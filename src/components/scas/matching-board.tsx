"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import { StickyCell, StickyHead } from "@/components/shared/sticky-cell";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money } from "@/domain";
import type {
  ScasActorRole,
  ScasBid,
  ScasBidStatus,
  ScasListing,
  ScasListingStatus,
} from "@/domain";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatLedgerTimestamp, formatMoney } from "@/lib/format";
import { scasPartyName } from "@/services/scas-service";

const ISSUER_ID = "iss-demo-agro";
const PRODUCER_ID = "prd-karaganda-fields";

type Actor = { role: ScasActorRole; id: string };

export function MatchingBoard({
  initialListings,
  initialBids,
}: {
  initialListings: ScasListing[];
  initialBids: ScasBid[];
}) {
  const t = useTranslations("scas.matching");
  const tScas = useTranslations("scas");
  const tUnits = useTranslations("units");
  const locale = useLocale() as AppLocale;
  const [actorRole, setActorRole] = useState<ScasActorRole>("issuer");
  const [listings, setListings] = useState(initialListings);
  const [bids, setBids] = useState(initialBids);
  const [selectedListingId, setSelectedListingId] = useState(
    initialListings[0]?.id ?? "",
  );
  const [selectedBidId, setSelectedBidId] = useState<string | null>(
    initialBids.find((bid) => bid.listingId === initialListings[0]?.id)?.id ??
      null,
  );
  const [comment, setComment] = useState("");
  const [volumeInput, setVolumeInput] = useState(
    String(initialListings[0]?.volumeTonnes ?? ""),
  );
  const [priceInput, setPriceInput] = useState(
    String(initialListings[0]?.indicativePriceKztPerTonne ?? ""),
  );
  const [bidSeq, setBidSeq] = useState(1);
  const [messageSeq, setMessageSeq] = useState(1);
  const [dacSeq, setDacSeq] = useState(1);

  const actor: Actor =
    actorRole === "issuer"
      ? { role: "issuer", id: ISSUER_ID }
      : { role: "producer", id: PRODUCER_ID };

  const selectedListing = listings.find((row) => row.id === selectedListingId);
  const listingBids = useMemo(
    () => bids.filter((bid) => bid.listingId === selectedListingId),
    [bids, selectedListingId],
  );
  const selectedBid =
    listingBids.find((bid) => bid.id === selectedBidId) ?? listingBids[0];
  const formed = bids.filter((bid) => bid.resultingContractId);

  function nextBidId() {
    const id = `BID-DEMO-${String(bidSeq).padStart(3, "0")}`;
    setBidSeq((value) => value + 1);
    return id;
  }

  function nextMessageId() {
    const id = `MSG-DEMO-${String(messageSeq).padStart(3, "0")}`;
    setMessageSeq((value) => value + 1);
    return id;
  }

  function nextContractId() {
    const id = `DAC-SCAS-${String(dacSeq).padStart(4, "0")}`;
    setDacSeq((value) => value + 1);
    return id;
  }

  function selectListing(id: string) {
    setSelectedListingId(id);
    const first = bids.find((bid) => bid.listingId === id);
    setSelectedBidId(first?.id ?? null);
    const listing = listings.find((row) => row.id === id);
    setVolumeInput(listing ? String(listing.volumeTonnes) : "");
    setPriceInput(listing ? String(listing.indicativePriceKztPerTonne) : "");
    setComment("");
  }

  function appendMessage(bidId: string, body: string) {
    const messageId = nextMessageId();
    setBids((current) =>
      current.map((bid) =>
        bid.id === bidId
          ? {
              ...bid,
              messages: [
                ...bid.messages,
                {
                  id: messageId,
                  authorId: actor.id,
                  body,
                  at: new Date().toISOString(),
                },
              ],
            }
          : bid,
      ),
    );
    setComment("");
  }

  function placeBid() {
    if (!selectedListing || !canPlaceBid(selectedListing, actor, bids)) {
      return;
    }
    const volume = Number(volumeInput || selectedListing.volumeTonnes);
    const price = Number(priceInput || selectedListing.indicativePriceKztPerTonne);
    if (!Number.isFinite(volume) || volume <= 0) {
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      return;
    }
    const bidId = nextBidId();
    const note = comment.trim();
    const messageId = note ? nextMessageId() : null;
    const bid: ScasBid = {
      id: bidId,
      listingId: selectedListing.id,
      bidderId: actor.id,
      volumeTonnes: Math.min(volume, selectedListing.volumeTonnes),
      priceKztPerTonne: price,
      deliveryPeriod: selectedListing.deliveryPeriod,
      status: "OPEN",
      messages: note && messageId
        ? [
            {
              id: messageId,
              authorId: actor.id,
              body: note,
              at: new Date().toISOString(),
            },
          ]
        : [],
    };
    setBids((current) => [...current, bid]);
    setSelectedBidId(bidId);
    setComment("");
  }

  function acceptBid(bid: ScasBid) {
    if (!selectedListing || !canDecide(selectedListing, actor, bid)) {
      return;
    }
    const contractId = nextContractId();
    const note = comment.trim();
    const messageId = note ? nextMessageId() : null;
    setListings((current) =>
      current.map((row) =>
        row.id === selectedListing.id
          ? { ...row, status: "MATCHED" satisfies ScasListingStatus }
          : row,
      ),
    );
    setBids((current) =>
      current.map((item) => {
        if (item.id === bid.id) {
          return {
            ...item,
            status: "ACCEPTED" satisfies ScasBidStatus,
            resultingContractId: contractId,
            messages: note && messageId
              ? [
                  ...item.messages,
                  {
                    id: messageId,
                    authorId: actor.id,
                    body: note,
                    at: new Date().toISOString(),
                  },
                ]
              : item.messages,
          };
        }
        if (item.listingId === selectedListing.id && item.status === "OPEN") {
          return { ...item, status: "REJECTED" satisfies ScasBidStatus };
        }
        return item;
      }),
    );
    setComment("");
  }

  function rejectBid(bid: ScasBid) {
    if (!selectedListing || !canDecide(selectedListing, actor, bid)) {
      return;
    }
    const note = comment.trim();
    const messageId = note ? nextMessageId() : null;
    setBids((current) =>
      current.map((item) =>
        item.id === bid.id
          ? {
              ...item,
              status: "REJECTED" satisfies ScasBidStatus,
              messages: note && messageId
                ? [
                    ...item.messages,
                    {
                      id: messageId,
                      authorId: actor.id,
                      body: note,
                      at: new Date().toISOString(),
                    },
                  ]
                : item.messages,
            }
          : item,
      ),
    );
    setComment("");
  }

  function withdrawBid(bid: ScasBid) {
    if (bid.bidderId !== actor.id || bid.status !== "OPEN") {
      return;
    }
    setBids((current) =>
      current.map((item) =>
        item.id === bid.id
          ? { ...item, status: "WITHDRAWN" satisfies ScasBidStatus }
          : item,
      ),
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("demoNote")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs tracking-wide text-muted-foreground">
          {t("actAs")}
        </span>
        <Button
          size="xs"
          variant={actorRole === "issuer" ? "default" : "outline"}
          onClick={() => setActorRole("issuer")}
        >
          {t("actIssuer")}
        </Button>
        <Button
          size="xs"
          variant={actorRole === "producer" ? "default" : "outline"}
          onClick={() => setActorRole("producer")}
        >
          {t("actProducer")}
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("actingAs", { name: scasPartyName(actor.id) })}
        </span>
      </div>

      <Table className="min-w-[56rem]">
        <TableHeader>
          <TableRow>
            <StickyHead>{t("columns.id")}</StickyHead>
            <TableHead>{t("columns.side")}</TableHead>
            <TableHead>{t("columns.owner")}</TableHead>
            <TableHead>{t("columns.crop")}</TableHead>
            <TableHead>{t("columns.volume")}</TableHead>
            <TableHead>{t("columns.delivery")}</TableHead>
            <TableHead>{t("columns.price")}</TableHead>
            <TableHead>{t("columns.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {listings.map((listing) => (
            <TableRow
              key={listing.id}
              data-state={listing.id === selectedListingId ? "selected" : undefined}
              className="cursor-pointer"
              onClick={() => selectListing(listing.id)}
            >
              <StickyCell className="font-tabular text-xs">{listing.id}</StickyCell>
              <TableCell>{lookupMessage(t, `sides.${listing.side}`)}</TableCell>
              <TableCell>{scasPartyName(listing.ownerId)}</TableCell>
              <TableCell>
                {listing.crop}, {listing.quality}
              </TableCell>
              <TableCell className="font-tabular">
                {tUnits("tonnes", {
                  value: formatInteger(listing.volumeTonnes, locale),
                })}
              </TableCell>
              <TableCell>{listing.deliveryPeriod}</TableCell>
              <TableCell className="font-tabular text-xs">
                {t("perTonne", {
                  value: formatMoney(
                    money(listing.indicativePriceKztPerTonne, "KZT"),
                    locale,
                  ),
                })}
              </TableCell>
              <TableCell>
                <StatusBadge value={listing.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {selectedListing ? (
        <PageSection
          title={t("detailTitle", { id: selectedListing.id })}
          description={lookupMessage(t, `terms.${selectedListing.termsKey}`)}
        >
          <div className="mb-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
            <p>
              {t("related")}:{" "}
              {selectedListing.relatedContractId ? (
                <Link
                  href={`/contracts/${selectedListing.relatedContractId}`}
                  className="font-tabular text-primary hover:underline"
                >
                  {selectedListing.relatedContractId}
                </Link>
              ) : (
                t("noRelated")
              )}
            </p>
            <p>
              {t("indicative")}:{" "}
              {t("perTonne", {
                value: formatMoney(
                  money(selectedListing.indicativePriceKztPerTonne, "KZT"),
                  locale,
                ),
              })}
            </p>
          </div>

          {listingBids.length === 0 ? (
            <EmptyState>{t("noBids")}</EmptyState>
          ) : (
            <Table className="min-w-[40rem]">
              <TableHeader>
                <TableRow>
                  <StickyHead>{t("columns.bid")}</StickyHead>
                  <TableHead>{t("columns.bidder")}</TableHead>
                  <TableHead>{t("columns.volume")}</TableHead>
                  <TableHead>{t("columns.price")}</TableHead>
                  <TableHead>{t("columns.status")}</TableHead>
                  <TableHead>{t("columns.dac")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listingBids.map((bid) => (
                  <TableRow
                    key={bid.id}
                    data-state={bid.id === selectedBid?.id ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={() => setSelectedBidId(bid.id)}
                  >
                    <StickyCell className="font-tabular text-xs">{bid.id}</StickyCell>
                    <TableCell>{scasPartyName(bid.bidderId)}</TableCell>
                    <TableCell className="font-tabular">
                      {tUnits("tonnes", {
                        value: formatInteger(bid.volumeTonnes, locale),
                      })}
                    </TableCell>
                    <TableCell className="font-tabular text-xs">
                      {t("perTonne", {
                        value: formatMoney(
                          money(bid.priceKztPerTonne, "KZT"),
                          locale,
                        ),
                      })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={bid.status} />
                    </TableCell>
                    <TableCell className="font-tabular text-xs">
                      {bid.resultingContractId ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {selectedBid ? (
            <div className="mt-4 space-y-3">
              <p className="text-xs tracking-wide text-muted-foreground">
                {t("threadTitle", { id: selectedBid.id })}
              </p>
              <ul className="space-y-2 border border-border bg-card px-3 py-3">
                {selectedBid.messages.length === 0 ? (
                  <li className="text-sm text-muted-foreground">{t("noMessages")}</li>
                ) : (
                  selectedBid.messages.map((message) => (
                    <li key={message.id} className="text-sm">
                      <span className="text-xs text-muted-foreground">
                        {formatLedgerTimestamp(message.at, locale)} ·{" "}
                        {scasPartyName(message.authorId)}
                      </span>
                      <p className="mt-0.5">
                        {message.body ??
                          (message.bodyKey
                            ? lookupMessage(t, `thread.${message.bodyKey}`)
                            : "")}
                      </p>
                    </li>
                  ))
                )}
              </ul>
              {canComment(selectedListing, actor, selectedBid) ? (
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={2}
                  className="w-full border border-border bg-background px-2 py-1 text-xs"
                  placeholder={t("commentPlaceholder")}
                />
              ) : null}
              <div className="flex flex-wrap gap-1">
                {canComment(selectedListing, actor, selectedBid) ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={!comment.trim()}
                    onClick={() => appendMessage(selectedBid.id, comment.trim())}
                  >
                    {t("sendComment")}
                  </Button>
                ) : null}
                {canDecide(selectedListing, actor, selectedBid) ? (
                  <>
                    <Button size="xs" onClick={() => acceptBid(selectedBid)}>
                      {t("accept")}
                    </Button>
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() => rejectBid(selectedBid)}
                    >
                      {tScas("reject")}
                    </Button>
                  </>
                ) : null}
                {selectedBid.bidderId === actor.id &&
                selectedBid.status === "OPEN" ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => withdrawBid(selectedBid)}
                  >
                    {t("withdraw")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {canPlaceBid(selectedListing, actor, bids) ? (
            <div className="mt-4 space-y-2 border border-dashed border-border bg-card px-3 py-3">
              <p className="text-xs tracking-wide text-muted-foreground">
                {t("placeBid")}
              </p>
              <div className="flex flex-wrap gap-2">
                <label className="text-xs text-muted-foreground">
                  {t("columns.volume")}
                  <input
                    value={volumeInput}
                    onChange={(event) => setVolumeInput(event.target.value)}
                    inputMode="numeric"
                    className="ml-2 w-24 border border-border bg-background px-2 py-1 font-tabular text-xs"
                  />
                </label>
                <label className="text-xs text-muted-foreground">
                  {t("columns.price")}
                  <input
                    value={priceInput}
                    onChange={(event) => setPriceInput(event.target.value)}
                    inputMode="numeric"
                    className="ml-2 w-28 border border-border bg-background px-2 py-1 font-tabular text-xs"
                  />
                </label>
              </div>
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                rows={2}
                className="w-full border border-border bg-background px-2 py-1 text-xs"
                placeholder={t("commentPlaceholder")}
              />
              <Button size="xs" onClick={placeBid}>
                {t("submitBid")}
              </Button>
            </div>
          ) : selectedListing.ownerId === actor.id ? (
            <p className="mt-3 text-xs text-muted-foreground">{t("ownListing")}</p>
          ) : null}
        </PageSection>
      ) : null}

      <PageSection title={t("formedTitle")} description={t("formedIntro")}>
        {formed.length === 0 ? (
          <EmptyState>{t("noFormed")}</EmptyState>
        ) : (
          <ul className="space-y-2">
            {formed.map((bid) => (
              <li
                key={bid.id}
                className="border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="font-tabular text-xs">
                  {bid.resultingContractId}
                </span>
                <span className="mx-2 text-muted-foreground">·</span>
                {t("formedLine", {
                  listing: bid.listingId,
                  bidder: scasPartyName(bid.bidderId),
                })}
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </div>
  );
}

function canPlaceBid(
  listing: ScasListing,
  actor: Actor,
  bids: ScasBid[],
): boolean {
  if (listing.status !== "OPEN" || listing.ownerId === actor.id) {
    return false;
  }
  if (actor.role === "issuer" && listing.side !== "OFFER") {
    return false;
  }
  if (actor.role === "producer" && listing.side !== "DEMAND") {
    return false;
  }
  return !bids.some(
    (bid) =>
      bid.listingId === listing.id &&
      bid.bidderId === actor.id &&
      bid.status === "OPEN",
  );
}

function canDecide(listing: ScasListing, actor: Actor, bid: ScasBid): boolean {
  return (
    listing.ownerId === actor.id &&
    listing.status === "OPEN" &&
    bid.status === "OPEN"
  );
}

function canComment(listing: ScasListing, actor: Actor, bid: ScasBid): boolean {
  return (
    bid.status === "OPEN" &&
    (bid.bidderId === actor.id || listing.ownerId === actor.id)
  );
}
