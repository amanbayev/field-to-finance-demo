import type { ContractPool, IssuerScore } from "@/domain";
import { wheatPoolCoverageFromEngine } from "./coverage";

export const issuerScore: IssuerScore = {
  issuerId: "iss-demo-agro",
  value: 81,
  maxValue: 100,
  asOf: "2026-06-01",
};

export const wheatPool2027: ContractPool = {
  id: "POOL-WHEAT-2027-01",
  name: "2027 Wheat Pool",
  crop: "Wheat",
  season: 2027,
  contractIds: [
    "DAC-2027-0001",
    "DAC-2027-0002",
    "DAC-2027-0003",
    "DAC-2027-0004",
  ],
  members: [
    { contractId: "DAC-2027-0001", volumeTonnes: 2800, eligibility: "ELIGIBLE" },
    { contractId: "DAC-2027-0002", volumeTonnes: 2400, eligibility: "ELIGIBLE" },
    { contractId: "DAC-2027-0003", volumeTonnes: 3100, eligibility: "ELIGIBLE" },
    { contractId: "DAC-2027-0004", volumeTonnes: 1700, eligibility: "ELIGIBLE" },
  ],
  coverage: wheatPoolCoverageFromEngine(),
};

export const pools: ContractPool[] = [wheatPool2027];
