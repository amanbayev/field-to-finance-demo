"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState, PageSection } from "@/components/shared/page-section";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  evaluateMintTranche,
  evaluatePrepareTranche,
  remainingIssuanceCapacity,
} from "@/domain";
import type { IssuanceTranche } from "@/domain";
import { lookupMessage } from "@/i18n/t-dynamic";
import type { AppLocale } from "@/i18n/config";
import { formatInteger, formatLedgerTimestamp } from "@/lib/format";
import type { IssuanceGate } from "@/services/token-service";

export function IssuanceDesk({
  tokenId,
  eligibleCoverageTonnes,
  outstandingTokens,
  mintDeployed,
  gates,
}: {
  tokenId: string;
  eligibleCoverageTonnes: number;
  outstandingTokens: number;
  mintDeployed: boolean;
  gates: IssuanceGate[];
}) {
  const t = useTranslations("tokens");
  const tUnits = useTranslations("units");
  const locale = useLocale() as AppLocale;
  const [tranches, setTranches] = useState<IssuanceTranche[]>([]);
  const [volumeInput, setVolumeInput] = useState("1000");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [seq, setSeq] = useState(1);

  const reserved = useMemo(
    () =>
      tranches
        .filter((item) => item.status === "PREPARED")
        .reduce((sum, item) => sum + item.volumeTonnes, 0),
    [tranches],
  );
  const position = {
    eligibleCoverageTonnes,
    outstandingTokens,
    reservedTokens: reserved,
  };
  const remaining = remainingIssuanceCapacity(position);

  function prepare() {
    const amount = Number(volumeInput);
    const decision = evaluatePrepareTranche(position, amount);
    if (!decision.allowed) {
      setErrorKey(decision.reason);
      return;
    }
    const id = `ISS-PREP-${String(seq).padStart(3, "0")}`;
    setSeq((value) => value + 1);
    setTranches((current) => [
      ...current,
      {
        id,
        tokenId,
        volumeTonnes: amount,
        status: "PREPARED",
        preparedAt: new Date().toISOString(),
      },
    ]);
    setErrorKey(null);
  }

  function cancel(id: string) {
    setTranches((current) =>
      current.map((item) =>
        item.id === id && item.status === "PREPARED"
          ? { ...item, status: "CANCELLED" }
          : item,
      ),
    );
    setErrorKey(null);
  }

  const mintBlocked = evaluateMintTranche(position, 1, mintDeployed);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t("deskDemoNote")}</p>
      <ul className="divide-y divide-harvest/15 border-y border-harvest/20">
        {gates.map((gate) => (
          <li
            key={gate.key}
            className="flex items-center justify-between gap-4 px-0 py-3"
          >
            <span className="text-sm">
              {lookupMessage(t, `gates.${gate.key}`)}
            </span>
            <StatusBadge value={gate.passed ? "PASSED" : "PENDING"} />
          </li>
        ))}
      </ul>
      <p className="text-sm">
        {t("remaining")}{" "}
        <span className="font-tabular font-medium">
          {tUnits("tonnes", { value: formatInteger(remaining, locale) })}
        </span>
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-muted-foreground">
          {t("trancheVolume")}
          <input
            value={volumeInput}
            onChange={(event) => setVolumeInput(event.target.value)}
            inputMode="numeric"
            className="ml-2 w-28 border border-border bg-background px-2 py-1 font-tabular text-xs"
          />
        </label>
        <Button size="xs" onClick={prepare}>
          {t("prepare")}
        </Button>
      </div>
      {errorKey ? (
        <p className="text-xs text-destructive">
          {lookupMessage(t, `errors.${errorKey}`)}
        </p>
      ) : null}

      <PageSection title={t("preparedTitle")} description={t("preparedIntro")}>
        {tranches.length === 0 ? (
          <EmptyState>{t("noPrepared")}</EmptyState>
        ) : (
          <Table className="min-w-[36rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.id")}</TableHead>
                <TableHead>{t("columns.volume")}</TableHead>
                <TableHead>{t("columns.status")}</TableHead>
                <TableHead>{t("columns.time")}</TableHead>
                <TableHead>{t("columns.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tranches.map((tranche) => (
                <TableRow key={tranche.id}>
                  <TableCell className="font-tabular text-xs">
                    {tranche.id}
                  </TableCell>
                  <TableCell className="font-tabular">
                    {tUnits("tonnes", {
                      value: formatInteger(tranche.volumeTonnes, locale),
                    })}
                  </TableCell>
                  <TableCell>
                    <StatusBadge value={tranche.status} />
                  </TableCell>
                  <TableCell className="font-tabular text-xs text-muted-foreground">
                    {formatLedgerTimestamp(tranche.preparedAt, locale)}
                  </TableCell>
                  <TableCell>
                    {tranche.status === "PREPARED" ? (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => cancel(tranche.id)}
                      >
                        {t("cancel")}
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageSection>

      <p className="text-xs text-muted-foreground">
        {mintBlocked.reason === "mint_not_deployed"
          ? t("mintBlocked")
          : null}
      </p>
    </div>
  );
}
