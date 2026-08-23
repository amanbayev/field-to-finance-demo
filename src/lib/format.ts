import type { Money } from "@/domain/money";
import {
  BASE_CURRENCY,
  REFERENCE_CURRENCY,
} from "@/adapters/fx/config";
import { fxProvider } from "@/adapters/fx";
import type { AppLocale } from "@/i18n/config";

const months: Record<AppLocale, readonly string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ru: ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."],
  kk: ["қаң.", "ақп.", "нау.", "сәу.", "мам.", "мау.", "шіл.", "там.", "қыр.", "қаз.", "қар.", "жел."],
};

function groupInteger(digits: string, locale: AppLocale): string {
  const separator = locale === "en" ? "," : "\u00a0";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function formatGroupedNumber(
  value: number,
  locale: AppLocale,
  fractionDigits = 0,
): string {
  const sign = value < 0 ? "-" : "";
  const absolute = Math.abs(value);
  const factor = 10 ** fractionDigits;
  const rounded = Math.round(absolute * factor) / factor;
  const [integerDigits, fractionDigitsPart] = rounded
    .toFixed(fractionDigits)
    .split(".");
  const grouped = groupInteger(integerDigits ?? "0", locale);
  if (fractionDigits === 0) {
    return `${sign}${grouped}`;
  }
  const decimal = locale === "en" ? "." : ",";
  return `${sign}${grouped}${decimal}${fractionDigitsPart}`;
}

export function formatInteger(value: number, locale: AppLocale): string {
  return formatGroupedNumber(value, locale, 0);
}

export function formatDemoKzt(value: number, locale: AppLocale): string {
  return `${formatInteger(value, locale)} DEMO-KZT`;
}

export function formatNumber(
  value: number,
  locale: AppLocale,
  fractionDigits = 0,
): string {
  return formatGroupedNumber(value, locale, fractionDigits);
}

export function formatMoney(
  value: Money,
  locale: AppLocale,
  options?: { compact?: boolean },
): string {
  const symbol = value.currency === "KZT" ? "₸" : "$";
  if (options?.compact && Math.abs(value.amount) >= 1_000_000) {
    return `${symbol}${formatGroupedNumber(value.amount / 1_000_000, locale, 1)}M`;
  }
  return `${symbol}${formatGroupedNumber(value.amount, locale, 0)}`;
}

export function toPrimaryAndReference(value: Money): {
  primary: Money;
  reference: Money;
} {
  const primary = fxProvider.convert(value, BASE_CURRENCY);
  const reference = fxProvider.convert(primary, REFERENCE_CURRENCY);
  return { primary, reference };
}

export function formatPercent(
  value: number,
  locale: AppLocale,
  fractionDigits = 0,
): string {
  return `${formatNumber(value, locale, fractionDigits)}%`;
}

export function formatSignedPercent(value: number, locale: AppLocale): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, locale, 0)}%`;
}

export function formatScore(value: number, maxValue: number): string {
  return `${value} / ${maxValue}`;
}

export function formatLedgerTimestamp(iso: string, locale: AppLocale): string {
  const date = new Date(iso);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = months[locale][date.getUTCMonth()] ?? "";
  const year = date.getUTCFullYear();
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} ${hours}:${minutes}`;
}

export function formatTimestamp(iso: string, locale: AppLocale): string {
  return formatLedgerTimestamp(iso, locale);
}
