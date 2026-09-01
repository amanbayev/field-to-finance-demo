import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MarketStatusChip } from "@/components/market-core/market-status-chip";
import { DataList } from "@/components/shared/data-list";
import {
  DeskLedger,
  DeskRow,
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
import type { AppLocale } from "@/i18n/config";
import { lookupMessage } from "@/i18n/t-dynamic";
import { formatTimestamp } from "@/lib/format";
import {
  eligibilityAttributionFields,
  presentEligibilityExplanation,
  showAssessmentAttribution,
} from "@/lib/market-core/eligibility-presentation";
import type { InstrumentEligibilityReadModelRow } from "@/services/market-core-service";

function instrumentLabel(
  row: InstrumentEligibilityReadModelRow,
  placeholder: string,
): string {
  if (row.placeholderInstrument) {
    return placeholder;
  }
  return row.instrumentSymbol ?? placeholder;
}

export async function InstrumentEligibilityTable({
  rows,
}: {
  rows: readonly InstrumentEligibilityReadModelRow[];
}) {
  const t = await getTranslations("eligibility");
  const locale = (await getLocale()) as AppLocale;

  return (
    <DeskSplit
      compact={
        <DeskLedger>
          {rows.map((row, index) => {
            const presented = presentEligibilityExplanation(row.explanation);
            const label = instrumentLabel(row, lookupMessage(t, "placeholderInstrument"));
            return (
              <DeskRow
                key={`${row.participantReference}-${row.instrumentId}`}
                index={deskIndex(index)}
                kicker={row.participantName}
                title={
                  row.instrumentHref ? (
                    <Link href={row.instrumentHref} className="text-primary hover:underline">
                      {label}
                    </Link>
                  ) : (
                    label
                  )
                }
                value={
                  <MarketStatusChip
                    label={lookupMessage(t, presented.stateKey)}
                    tone={presented.tone}
                  />
                }
                block={
                  <EligibilityRowExplanation
                    row={row}
                    presented={presented}
                    t={t}
                    locale={locale}
                  />
                }
              />
            );
          })}
        </DeskLedger>
      }
      wide={
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columnParticipant")}</TableHead>
              <TableHead>{t("columnInstrument")}</TableHead>
              <TableHead>{t("labelInstrumentEligibility")}</TableHead>
              <TableHead>{t("columnNewOrders")}</TableHead>
              <TableHead>{t("columnReceiving")}</TableHead>
              <TableHead>{t("labelNewOrderAdmission")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const presented = presentEligibilityExplanation(row.explanation);
              const label = instrumentLabel(row, lookupMessage(t, "placeholderInstrument"));
              return (
                <TableRow key={`${row.participantReference}-${row.instrumentId}`}>
                  <TableCell className="font-medium">{row.participantName}</TableCell>
                  <TableCell>
                    {row.instrumentHref ? (
                      <Link href={row.instrumentHref} className="text-primary hover:underline">
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </TableCell>
                  <TableCell>
                    <MarketStatusChip
                      label={lookupMessage(t, presented.stateKey)}
                      tone={presented.tone}
                    />
                  </TableCell>
                  <TableCell>{row.canTrade ? t("yes") : t("no")}</TableCell>
                  <TableCell>{row.canReceive ? t("yes") : t("no")}</TableCell>
                  <TableCell className="max-w-sm">
                    <EligibilityRowExplanation
                      row={row}
                      presented={presented}
                      t={t}
                      locale={locale}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      }
    />
  );
}

export function EligibilityRowExplanation({
  row,
  presented,
  t,
  locale,
}: {
  row: InstrumentEligibilityReadModelRow;
  presented: ReturnType<typeof presentEligibilityExplanation>;
  t: Awaited<ReturnType<typeof getTranslations>>;
  locale: AppLocale;
}) {
  const items: { label: string; value: string }[] = [];
  const attribution = eligibilityAttributionFields(presented);
  if (attribution) {
    items.push({
      label: t("organizationRelationship"),
      value: presented.organizationRecorded
        ? (row.organizationName ?? lookupMessage(t, "organizationRecorded"))
        : lookupMessage(t, "organizationMissing"),
    });
    items.push({
      label: lookupMessage(t, attribution.membership.labelKey),
      value: lookupMessage(t, attribution.membership.valueKey),
    });
    items.push({
      label: lookupMessage(t, attribution.assessment.labelKey),
      value: lookupMessage(t, attribution.assessment.valueKey),
    });
    if (presented.authorityKey) {
      items.push({
        label: t("authority"),
        value: lookupMessage(t, presented.authorityKey),
      });
    }
    if (presented.reasonKey) {
      items.push({
        label: t("reason"),
        value: lookupMessage(t, presented.reasonKey),
      });
    }
    items.push({
      label: t("recordedDate"),
      value:
        presented.recordedAt == null
          ? lookupMessage(t, presented.recordedAtKey ?? "dateNotClaimed")
          : formatTimestamp(presented.recordedAt, locale),
    });
    items.push({
      label: t("evidenceReferences"),
      value: lookupMessage(t, presented.evidenceKey),
    });
    items.push({
      label: t("columnAttribution"),
      value: presented.attributionComplete
        ? lookupMessage(t, "attributionComplete")
        : lookupMessage(t, "attributionIncomplete"),
    });
  }

  const gaps = presented.gapKeys.map((key) => lookupMessage(t, key));
  const inconsistencies = presented.inconsistencyKeys.map((key) => lookupMessage(t, key));

  return (
    <div className="space-y-2 text-sm text-straw">
      <p>{lookupMessage(t, presented.summaryKey)}</p>
      <p>
        {row.canTrade
          ? lookupMessage(t, "newOrderAllowed")
          : lookupMessage(t, "newOrderUnavailable")}
        {" · "}
        {row.canReceive
          ? lookupMessage(t, "canReceiveAllowed")
          : lookupMessage(t, "canReceiveUnavailable")}
      </p>
      {showAssessmentAttribution(presented) ? (
        <details>
          <summary className="cursor-pointer text-harvest">{t("assessmentDetails")}</summary>
          <div className="mt-2">
            <DataList items={items} />
          </div>
        </details>
      ) : (
        <p>
          {presented.state === "POLICY_PENDING"
            ? lookupMessage(t, "summaryPolicyPending")
            : lookupMessage(t, "noAssessmentRecorded")}
        </p>
      )}
      {gaps.length > 0 ? (
        <ul className="list-disc pl-4">
          {gaps.map((gap) => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
      ) : null}
      {inconsistencies.length > 0 ? (
        <ul className="list-disc pl-4">
          {inconsistencies.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
