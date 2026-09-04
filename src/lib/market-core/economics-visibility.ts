/**
 * Central lifecycle policy for whether instrument economics may be shown.
 *
 * Generic: it reads lifecycle status, not asset name, protocol id, or
 * instrument id. The universal shell applies this even if a protocol adapter
 * returns offer / price / yield / term data for a non-issued instrument.
 */

export const ECONOMICS_PERMITTED_STATUSES = ["ISSUED", "ADMITTED"] as const;

export type EconomicsPermittedStatus = (typeof ECONOMICS_PERMITTED_STATUSES)[number];

export const ECONOMICS_WITHHELD_REASON_KEY = "economicsWithheldNotIssued";

export type EconomicsVisibility =
  | { readonly kind: "PERMITTED" }
  | { readonly kind: "WITHHELD"; readonly reasonKey: string };

const PERMITTED = new Set<string>(ECONOMICS_PERMITTED_STATUSES);

/**
 * ISSUED and genuinely ADMITTED instruments may show economics that actually
 * exist in canonical or adapter data. STRUCTURING, CONCEPT, FUTURE, and any
 * unrecognised status are withheld — not as a rejection, but because there is
 * no offering.
 */
export function economicsVisibilityForInstrument(instrument: {
  readonly status: string;
}): EconomicsVisibility {
  if (PERMITTED.has(instrument.status)) {
    return { kind: "PERMITTED" };
  }
  return {
    kind: "WITHHELD",
    reasonKey: ECONOMICS_WITHHELD_REASON_KEY,
  };
}

export function mayShowInstrumentEconomics(instrument: {
  readonly status: string;
}): boolean {
  return economicsVisibilityForInstrument(instrument).kind === "PERMITTED";
}
