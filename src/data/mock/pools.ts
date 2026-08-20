import type { ContractPool, IssuerScore } from "@/domain";

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
    { contractId: "DAC-2027-0004", volumeTonnes: 1700, eligibility: "WATCH" },
  ],
  coverage: {
    poolId: "POOL-WHEAT-2027-01",
    grossVolumeTonnes: 10000,
    adjustments: [
      { key: "producer", label: "Producer Risk", percentagePoints: -5 },
      { key: "weather", label: "Weather / Satellite", percentagePoints: -3 },
      { key: "concentration", label: "Regional Concentration", percentagePoints: -4 },
      { key: "quality", label: "Quality Risk", percentagePoints: -2 },
      { key: "insurance", label: "Insurance Adjustment", percentagePoints: 2 },
      { key: "issuer", label: "Issuer Risk", percentagePoints: -5 },
    ],
    totalHaircutPercent: 17,
    eligibleCoverageTonnes: 8300,
    maximumTokenIssuance: 8300,
    outstandingTokens: 8000,
    coverageRatioPercent: 103.75,
    status: "HEALTHY",
  },
};

export const pools: ContractPool[] = [wheatPool2027];
