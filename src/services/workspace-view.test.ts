import { describe, expect, it } from "vitest";
import { contracts } from "@/data/mock/contracts";
import { wheatPoolCoverageFromEngine } from "@/data/mock/coverage";
import {
  coverageBreachCount,
  isComplianceAlert,
  isVerificationComplete,
  producerFinancingStages,
  remainingCoverageCapacity,
} from "./workspace-view";
import { complianceRecords } from "@/data/mock/compliance";

describe("workspace views", () => {
  it("keeps wheat producer financing at not-provided", () => {
    const dac = contracts.find((item) => item.id === "DAC-2027-0001");
    expect(dac).toBeDefined();
    const stages = producerFinancingStages(dac!);
    expect(stages.filter((stage) => stage.id !== "finance").every((stage) => stage.done)).toBe(
      true,
    );
    expect(stages.find((stage) => stage.id === "finance")?.done).toBe(false);
    expect(isVerificationComplete(dac!.verification)).toBe(true);
  });

  it("derives remaining coverage from existing 8,300 / 1,000 state", () => {
    const coverage = wheatPoolCoverageFromEngine();
    expect(coverage.grossVolumeTonnes).toBe(10_000);
    expect(coverage.eligibleCoverageTonnes).toBe(8_300);
    expect(remainingCoverageCapacity(coverage, 1_000)).toBe(7_300);
    expect(coverageBreachCount(coverage.status)).toBe(0);
  });

  it("treats inv-demo-b as an existing compliance alert", () => {
    const blocked = complianceRecords.find((item) => item.participantId === "inv-demo-b");
    expect(blocked).toBeDefined();
    expect(isComplianceAlert(blocked!)).toBe(true);
  });
});
