import { describe, expect, it } from "vitest";
import { GRAIN_DESK_ID, STEPPE_CAPITAL_ID } from "@/domain/market-core";
import {
  grainDeskSettlementBlockers,
  settlementIdentitiesFromProof,
} from "./settlement-identities";

describe("settlement identities", () => {
  it("maps Steppe from recorded placement proof and leaves Grain Desk unmapped", () => {
    const rows = settlementIdentitiesFromProof();
    const steppe = rows.find((row) => row.participantId === STEPPE_CAPITAL_ID)!;
    const grain = rows.find((row) => row.participantId === GRAIN_DESK_ID)!;
    expect(steppe.status).toBe("MAPPED_PROOF_ONLY");
    expect(steppe.solanaWallet).toBeTruthy();
    expect(steppe.wheatAta).toBeTruthy();
    expect(grain.status).toBe("NOT_MAPPED");
    expect(grain.solanaWallet).toBeNull();
    expect(grain.wheatAta).toBeNull();
    expect(grain.demoKztAta).toBeNull();
    expect(grainDeskSettlementBlockers().length).toBeGreaterThan(0);
  });
});
