import type { CurrencyCode, Money } from "@/domain/money";
import { DEMO_USD_KZT_RATE } from "./config";
import type { FxProvider, FxQuote } from "./types";

export class DemoFxProvider implements FxProvider {
  constructor(
    private readonly usdKztRate: number = DEMO_USD_KZT_RATE,
    private readonly asOf: string = "2026-08-01",
  ) {}

  getQuote(base: CurrencyCode, quote: CurrencyCode): FxQuote {
    return {
      base,
      quote,
      rate: this.rate(base, quote),
      asOf: this.asOf,
      source: "DEMO_REFERENCE",
    };
  }

  convert(value: Money, to: CurrencyCode): Money {
    if (value.currency === to) {
      return value;
    }

    return {
      amount: value.amount * this.rate(value.currency, to),
      currency: to,
    };
  }

  private rate(from: CurrencyCode, to: CurrencyCode): number {
    if (from === to) {
      return 1;
    }
    if (from === "USD" && to === "KZT") {
      return this.usdKztRate;
    }
    if (from === "KZT" && to === "USD") {
      return 1 / this.usdKztRate;
    }
    throw new Error(`Unsupported demo FX pair ${from}/${to}.`);
  }
}
