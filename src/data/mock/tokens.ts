import type { AgriculturalToken } from "@/domain";

export const tokens: AgriculturalToken[] = [
  {
    id: "tok-wheat-2027",
    symbol: "WHEAT-2027",
    type: "Commodity Agricultural Token",
    issuerId: "iss-demo-agro",
    issuerName: "Demo Agro Issuer Ltd",
    tokenUnitDescription: "1 token = claim for 1 tonne of Wheat Class 3",
    poolId: "POOL-WHEAT-2027-01",
    maximumIssuance: 8300,
    issued: 0,
    network: "Solana Devnet",
    blockchainStatus: "NOT_YET_DEPLOYED",
  },
];
