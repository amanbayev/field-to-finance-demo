import type {
  HoldingBuckets,
  InstrumentEligibilityState,
  Market,
  MarketInstrument,
  ParticipantInstrumentEligibility,
} from "./types";

export function availableBalance(buckets: HoldingBuckets): number {
  return (
    buckets.owned -
    buckets.reservedForOrders -
    buckets.pledged -
    buckets.blocked
  );
}

export function withAvailable(buckets: HoldingBuckets): {
  buckets: HoldingBuckets;
  available: number;
} {
  return { buckets, available: availableBalance(buckets) };
}

export function eligibilityFor(
  rows: readonly ParticipantInstrumentEligibility[],
  participantReference: string,
  instrumentId: string,
): InstrumentEligibilityState {
  const row = rows.find(
    (item) =>
      item.participantReference === participantReference &&
      item.instrumentId === instrumentId,
  );
  return row?.state ?? "NOT_ASSESSED";
}

export function canTrade(input: {
  eligibility: InstrumentEligibilityState;
  instrument: MarketInstrument;
  market: Market;
}): boolean {
  if (input.market.transacting) {
    return false;
  }
  if (input.market.phase !== "SECONDARY_OPEN") {
    return false;
  }
  if (input.instrument.status !== "ISSUED" && input.instrument.status !== "ADMITTED") {
    return false;
  }
  return input.eligibility === "ELIGIBLE";
}

export function canReceive(input: {
  eligibility: InstrumentEligibilityState;
  instrument: MarketInstrument;
}): boolean {
  if (input.instrument.instrumentType === "PROTOCOL_INVESTMENT") {
    return false;
  }
  if (input.instrument.status === "FUTURE" || input.instrument.status === "STRUCTURING") {
    return false;
  }
  return input.eligibility === "ELIGIBLE";
}
