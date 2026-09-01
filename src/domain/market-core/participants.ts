export const WHEAT_DEMO_MARKET_ID = "MKT-WHEAT-2027-DEMO-KZT";
export const STEPPE_CAPITAL_ID = "INVESTOR-0001";
export const GRAIN_DESK_ID = "GRAIN-DESK";
export const REGISTRAR_ID = "REGISTRAR";
export const COMMODITY_DESK_ID = "COMMODITY-DESK";

const SLUG_TO_PARTICIPANT: Record<string, string> = {
  "steppe-capital": STEPPE_CAPITAL_ID,
  "grain-desk": GRAIN_DESK_ID,
  "agricultural-registrar": REGISTRAR_ID,
  "commodity-desk": COMMODITY_DESK_ID,
};

export function participantIdForOrganizationSlug(
  slug: string | undefined | null,
): string | null {
  if (!slug) {
    return null;
  }
  return SLUG_TO_PARTICIPANT[slug] ?? null;
}

export function participantIdFromInvestorRef(
  investorReference: string | null | undefined,
  organizationSlug?: string | null,
): string | null {
  if (investorReference) {
    return investorReference;
  }
  return participantIdForOrganizationSlug(organizationSlug);
}

/**
 * Trading participant identity belongs to the organisation. Multiple active
 * members of one trading organisation may resolve to this same reference.
 * Issuer organisations have no trading participant identity in this slice.
 */
export function participantIdForActor(actor: {
  effective: {
    investorReference?: string | null;
    organization?: { slug: string } | undefined;
  };
}): string | null {
  return participantIdFromInvestorRef(
    actor.effective.investorReference,
    actor.effective.organization?.slug,
  );
}
