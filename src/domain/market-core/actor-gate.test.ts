import { describe, expect, it } from "vitest";
import {
  participantMayTrade,
  roleMayDirectMatching,
  roleMayReadAllMarketRecords,
} from "./actor-gate";

describe("market actor gate", () => {
  it("allows Steppe Capital and Grain Desk to trade eligible WHEAT", () => {
    expect(
      participantMayTrade({
        roleId: "INVESTOR",
        participantId: "INVESTOR-0001",
        instrumentId: "WHEAT-2027",
        eligibility: "ELIGIBLE",
      }),
    ).toBe(true);
    expect(
      participantMayTrade({
        roleId: "TRADER",
        participantId: "GRAIN-DESK",
        instrumentId: "WHEAT-2027",
        eligibility: "ELIGIBLE",
      }),
    ).toBe(true);
  });

  it("blocks registrar, regulator, admin without participant, and protocol investment", () => {
    expect(
      participantMayTrade({
        roleId: "REGISTRAR_OPERATOR",
        participantId: "REGISTRAR",
        instrumentId: "WHEAT-2027",
        eligibility: "ELIGIBLE",
      }),
    ).toBe(false);
    expect(
      participantMayTrade({
        roleId: "REGULATOR",
        participantId: null,
        instrumentId: "WHEAT-2027",
        eligibility: "ELIGIBLE",
      }),
    ).toBe(false);
    expect(
      participantMayTrade({
        roleId: "SYSTEM_ADMIN",
        participantId: null,
        instrumentId: "WHEAT-2027",
        eligibility: "ELIGIBLE",
      }),
    ).toBe(false);
    expect(
      participantMayTrade({
        roleId: "INVESTOR",
        participantId: "INVESTOR-0001",
        instrumentId: "F2F-PROTOCOL-INVESTMENT",
        eligibility: "ELIGIBLE",
      }),
    ).toBe(false);
  });

  it("never lets any role pick a matching counterparty", () => {
    expect(roleMayDirectMatching("SYSTEM_ADMIN")).toBe(false);
    expect(roleMayDirectMatching("REGISTRAR_OPERATOR")).toBe(false);
    expect(roleMayDirectMatching("TRADER")).toBe(false);
  });

  it("gives supervisory roles read-all, not trade", () => {
    expect(roleMayReadAllMarketRecords("REGULATOR")).toBe(true);
    expect(roleMayReadAllMarketRecords("INVESTOR")).toBe(false);
  });
});
