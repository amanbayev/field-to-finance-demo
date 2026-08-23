import { recordedPlacementProof } from "@/adapters/blockchain/solana/recorded-placement";
import { GRAIN_DESK_ID, REGISTRAR_ID, STEPPE_CAPITAL_ID } from "@/domain/market-core";

export type SettlementIdentityStatus =
  | "MAPPED_ON_CHAIN"
  | "MAPPED_PROOF_ONLY"
  | "WALLET_ASSIGNED"
  | "NOT_MAPPED";

export interface SettlementIdentity {
  participantId: string;
  participantName: string;
  solanaWallet: string | null;
  wheatAta: string | null;
  demoKztAta: string | null;
  wheatAtaOnChain: boolean | null;
  demoKztAtaOnChain: boolean | null;
  status: SettlementIdentityStatus;
  notes: string;
  requiredPhase5B2Steps: string[];
}

/** Off-chain designated Grain Desk identity. Secret key is local and gitignored. */
export const GRAIN_DESK_SOLANA_WALLET =
  "71G4GdJVawxt5DCVxcghW96TaLDxDqNEA1mLybAuTU9Q";
export const GRAIN_DESK_WHEAT_ATA =
  "HQ1eM9ekdQkj3buuDgSdWsQ5DGnQnZc81sPCPC6j8unx";
export const GRAIN_DESK_DEMO_KZT_ATA =
  "ARouqPTtPwsVfXAV1yYuZidz2vApM1qKH62xC6i5YrcM";

export function settlementIdentitiesFromProof(): SettlementIdentity[] {
  const proof = recordedPlacementProof();
  return [
    {
      participantId: STEPPE_CAPITAL_ID,
      participantName: "Steppe Capital",
      solanaWallet: proof.investorWallet ?? null,
      wheatAta: proof.investorInstrumentAta ?? null,
      demoKztAta: proof.demoKzt?.investorAta ?? null,
      wheatAtaOnChain: true,
      demoKztAtaOnChain: true,
      status: "MAPPED_ON_CHAIN",
      notes:
        "Mapped from primary placement proof PL-ISS001-0001. Read-only Devnet check: WHEAT ATA and DEMO-KZT ATA exist. The wallet system account is unfunded; token accounts are owned by this pubkey.",
      requiredPhase5B2Steps: [],
    },
    {
      participantId: REGISTRAR_ID,
      participantName: "Agricultural Registrar",
      solanaWallet: null,
      wheatAta: proof.registrarInstrumentAta ?? null,
      demoKztAta: proof.demoKzt?.issuerSettlementAta ?? null,
      wheatAtaOnChain: null,
      demoKztAtaOnChain: null,
      status: "MAPPED_PROOF_ONLY",
      notes: "Registrar WHEAT ATA and issuer DEMO-KZT ATA from primary placement proof.",
      requiredPhase5B2Steps: [],
    },
    {
      participantId: GRAIN_DESK_ID,
      participantName: "Grain Desk",
      solanaWallet: GRAIN_DESK_SOLANA_WALLET,
      wheatAta: GRAIN_DESK_WHEAT_ATA,
      demoKztAta: GRAIN_DESK_DEMO_KZT_ATA,
      wheatAtaOnChain: false,
      demoKztAtaOnChain: false,
      status: "WALLET_ASSIGNED",
      notes:
        "Off-chain Grain Desk / DEMO-TRADER-001 wallet designated. Token-2022 ATAs are derived and do not exist on Devnet yet. Do not create ATAs in this phase.",
      requiredPhase5B2Steps: [
        "Create the WHEAT-2027 Token-2022 ATA (state-changing transaction).",
        "Create the DEMO-KZT Token-2022 ATA (state-changing transaction).",
        "Fund DEMO-KZT for the buyer (state-changing transaction; DEMO-KZT has no monetary value).",
      ],
    },
  ];
}

export function grainDeskSettlementBlockers(): string[] {
  const grain = settlementIdentitiesFromProof().find(
    (row) => row.participantId === GRAIN_DESK_ID,
  );
  return grain?.requiredPhase5B2Steps ?? [];
}
