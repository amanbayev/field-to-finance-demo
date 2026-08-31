/**
 * Prepared registrar book movement after a future confirmed secondary DvP.
 *
 * This module does not write the database. Chain confirmation is evidence only.
 * SETTLED is valid only after this book movement is applied by a later phase.
 */

export const SECONDARY_SEED_TRADE_ID = "TRD-SEED-001";
export const SECONDARY_SEED_SETTLEMENT_ID = "SET-SEED-001";

export interface RegistrarBookRow {
  participantId: string;
  registeredOwned: number;
}

export const PRE_SECONDARY_REGISTRAR_BOOK: readonly RegistrarBookRow[] = [
  { participantId: "REGISTRAR", registeredOwned: 990 },
  { participantId: "INVESTOR-0001", registeredOwned: 10 },
  { participantId: "GRAIN-DESK", registeredOwned: 0 },
];

export const POST_SECONDARY_REGISTRAR_BOOK: readonly RegistrarBookRow[] = [
  { participantId: "REGISTRAR", registeredOwned: 990 },
  { participantId: "INVESTOR-0001", registeredOwned: 8 },
  { participantId: "GRAIN-DESK", registeredOwned: 2 },
];

export interface RegistrarFinalizationPlan {
  tradeId: typeof SECONDARY_SEED_TRADE_ID;
  settlementId: typeof SECONDARY_SEED_SETTLEMENT_ID;
  instrumentId: "WHEAT-2027";
  quantity: 2;
  sellerParticipantId: "INVESTOR-0001";
  buyerParticipantId: "GRAIN-DESK";
  registrarUnchanged: 990;
  clearPendingAndReserved: true;
  syncHoldingsOwnedFromRegistrar: true;
  markSettledOnlyAfterThisFunction: true;
  invoked: false;
}

export const SECONDARY_REGISTRAR_FINALIZATION_PLAN: RegistrarFinalizationPlan = {
  tradeId: SECONDARY_SEED_TRADE_ID,
  settlementId: SECONDARY_SEED_SETTLEMENT_ID,
  instrumentId: "WHEAT-2027",
  quantity: 2,
  sellerParticipantId: "INVESTOR-0001",
  buyerParticipantId: "GRAIN-DESK",
  registrarUnchanged: 990,
  clearPendingAndReserved: true,
  syncHoldingsOwnedFromRegistrar: true,
  markSettledOnlyAfterThisFunction: true,
  invoked: false,
};

export function plannedRegistrarBookAfterSecondary(): readonly RegistrarBookRow[] {
  if (SECONDARY_REGISTRAR_FINALIZATION_PLAN.invoked) {
    return POST_SECONDARY_REGISTRAR_BOOK;
  }
  return PRE_SECONDARY_REGISTRAR_BOOK;
}
