import { describe, expect, it } from "vitest";
import { GRAIN_DESK_ID, STEPPE_CAPITAL_ID } from "@/domain/market-core";
import {
  GRAIN_DESK_DEMO_KZT_ATA,
  GRAIN_DESK_SOLANA_WALLET,
  GRAIN_DESK_WHEAT_ATA,
  grainDeskSettlementBlockers,
  settlementIdentitiesFromProof,
} from "./settlement-identities";

describe("settlement identities", () => {
  it("maps Steppe from recorded placement proof and live ATA checks", () => {
    const rows = settlementIdentitiesFromProof();
    const steppe = rows.find((row) => row.participantId === STEPPE_CAPITAL_ID)!;
    expect(steppe.status).toBe("MAPPED_ON_CHAIN");
    expect(steppe.solanaWallet).toBeTruthy();
    expect(steppe.wheatAta).toBeTruthy();
    expect(steppe.wheatAtaOnChain).toBe(true);
    expect(steppe.demoKztAtaOnChain).toBe(true);
  });

  it("assigns Grain Desk a public wallet and derived ATAs without claiming they exist on chain", () => {
    const rows = settlementIdentitiesFromProof();
    const grain = rows.find((row) => row.participantId === GRAIN_DESK_ID)!;
    expect(grain.status).toBe("WALLET_ASSIGNED");
    expect(grain.solanaWallet).toBe(GRAIN_DESK_SOLANA_WALLET);
    expect(grain.wheatAta).toBe(GRAIN_DESK_WHEAT_ATA);
    expect(grain.demoKztAta).toBe(GRAIN_DESK_DEMO_KZT_ATA);
    expect(grain.wheatAtaOnChain).toBe(false);
    expect(grain.demoKztAtaOnChain).toBe(false);
    expect(grainDeskSettlementBlockers()).toEqual(
      expect.arrayContaining([
        expect.stringContaining("WHEAT-2027 Token-2022 ATA"),
        expect.stringContaining("DEMO-KZT Token-2022 ATA"),
        expect.stringContaining("Fund DEMO-KZT"),
      ]),
    );
  });
});
