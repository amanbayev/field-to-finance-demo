import type { CurrencyCode } from "@/domain/money";

export const BASE_CURRENCY: CurrencyCode = "KZT";
export const REFERENCE_CURRENCY: CurrencyCode = "USD";

/**
 * Fixed demonstration rate: 1 USD = 500 KZT.
 * Not a live market FX quote. Replace DemoFxProvider later.
 */
export const DEMO_USD_KZT_RATE = 500;
