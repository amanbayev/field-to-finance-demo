import type { Money } from "@/domain/money";
import {
  BASE_CURRENCY,
  REFERENCE_CURRENCY,
} from "@/adapters/fx/config";
import { fxProvider } from "@/adapters/fx";
import { intlLocales, type AppLocale } from "@/i18n/config";

export function formatInteger(value: number, locale: AppLocale): string {
  return new Intl.NumberFormat(intlLocales[locale], {
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(
  value: number,
  locale: AppLocale,
  fractionDigits = 0,
): string {
  return new Intl.NumberFormat(intlLocales[locale], {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatMoney(
  value: Money,
  locale: AppLocale,
  options?: { compact?: boolean },
): string {
  const formatted = new Intl.NumberFormat(intlLocales[locale], {
    notation: options?.compact ? "compact" : "standard",
    maximumFractionDigits: options?.compact ? 2 : 0,
    minimumFractionDigits: 0,
  }).format(value.amount);
  const symbol = value.currency === "KZT" ? "₸" : "$";
  return `${symbol}${formatted}`;
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

export function formatTimestamp(iso: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlLocales[locale], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
}
