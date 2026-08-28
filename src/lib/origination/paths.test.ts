import { describe, expect, it } from "vitest";
import { contracts } from "@/data/mock/contracts";
import { listContracts } from "@/services/contract-service";
import {
  demonstratorContractPath,
  isDemonstratorContractId,
  originationFieldPath,
} from "./paths";

describe("origination vs demonstrator paths", () => {
  it("keeps live fields on /fields and DAC fixtures on /contracts", () => {
    expect(originationFieldPath("FIELD-2027-0009")).toBe("/fields/FIELD-2027-0009");
    expect(demonstratorContractPath("DAC-2027-0001")).toBe("/contracts/DAC-2027-0001");
    expect(isDemonstratorContractId("DAC-2027-0001")).toBe(true);
    expect(isDemonstratorContractId("FIELD-2027-0009")).toBe(false);
    expect(isDemonstratorContractId("DAC-2027-0014")).toBe(false);
  });

  it("does not treat mock DAC plots as origination public ids", () => {
    const dacIds = listContracts().map((item) => item.contract.id);
    expect(dacIds).toContain("DAC-2027-0001");
    expect(dacIds.every(isDemonstratorContractId)).toBe(true);
    expect(contracts.some((item) => item.id.startsWith("FIELD-"))).toBe(false);
  });
});
