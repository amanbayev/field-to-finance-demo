import { describe, expect, it } from "vitest";
import {
  PRIMARY_DVP_INSTRUCTION,
  SECONDARY_DVP_AUDIT,
  currentProgramCanSettleSecondaryDvp,
} from "./secondary-dvp";

describe("secondary DvP programme audit", () => {
  it("records that settle_primary_placement cannot settle a secondary trade", () => {
    expect(PRIMARY_DVP_INSTRUCTION).toBe("settle_primary_placement");
    expect(currentProgramCanSettleSecondaryDvp()).toBe(false);
    expect(SECONDARY_DVP_AUDIT.programRedeployRequired).toBe(true);
    expect(SECONDARY_DVP_AUDIT.requiredNewInstruction).toBe("settle_secondary_dvp");
    expect(SECONDARY_DVP_AUDIT.sourceInstructionImplemented).toBe(true);
    expect(SECONDARY_DVP_AUDIT.deployedProgramHasInstruction).toBe(false);
    expect(SECONDARY_DVP_AUDIT.secondaryAccounts.wheatSource).toContain("seller");
    expect(SECONDARY_DVP_AUDIT.secondaryAccounts.demoKztSource).toContain("buyer");
  });
});
