export function formatNumber(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatTonnes(value: number): string {
  return `${formatNumber(value)} t`;
}

export function formatHectares(value: number): string {
  return `${formatNumber(value)} hectares`;
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${formatNumber(value, fractionDigits)}%`;
}

export function formatSignedPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value}%`;
}

export function formatUsdCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatScore(value: number, maxValue: number): string {
  return `${value} / ${maxValue}`;
}

export function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function formatStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}
