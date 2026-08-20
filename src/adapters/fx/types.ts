import type { CurrencyCode, Money } from "@/domain/money";

export interface FxQuote {
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: number;
  asOf: string;
  source: "DEMO_REFERENCE" | "LIVE";
}

export interface FxProvider {
  getQuote(base: CurrencyCode, quote: CurrencyCode): FxQuote;
  convert(value: Money, to: CurrencyCode): Money;
}
