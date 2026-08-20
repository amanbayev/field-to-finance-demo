export type CurrencyCode = "KZT" | "USD";

export interface Money {
  amount: number;
  currency: CurrencyCode;
}

export function money(amount: number, currency: CurrencyCode): Money {
  return { amount, currency };
}
