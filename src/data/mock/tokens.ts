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
    issued: 1000,
    network: "Solana Devnet",
    blockchainStatus: "DEPLOYED",
    mintAddress: "D6Zy1doAzHJmQie7S5tUhJWFVZSY5CtJxYYWGJsV6QuF",
    terms: {
      kind: "COMMODITY",
      claimAgainst: "ISSUER",
      unitTonnesPerToken: 1,
      crop: "Wheat",
      quality: "Class 3",
      redemptionKind: "GRAIN_DELIVERY",
      redemptionWindow: "Aug–Oct 2027",
      workingHypothesis: true,
    },
  },
];
