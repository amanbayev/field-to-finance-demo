import { notFound } from "next/navigation";

export const DESIGN_REVIEW_INSTRUMENT_ID = "WHEAT-2027";
export const DESIGN_REVIEW_MARKET_ID = "MKT-WHEAT-2027-DEMO-KZT";

export function isDesignReviewEnabled(): boolean {
  if (process.env.VERCEL_ENV === "production") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
}

export function assertDesignReviewEnabled(): void {
  if (!isDesignReviewEnabled()) {
    notFound();
  }
}
