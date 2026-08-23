import { recordedPlacementProof } from "@/adapters/blockchain/solana/recorded-placement";
import { GRAIN_DESK_ID, REGISTRAR_ID, STEPPE_CAPITAL_ID } from "@/domain/market-core";

export type SettlementIdentityStatus =
  | "MAPPED_ON_CHAIN"
  | "MAPPED_PROOF_ONLY"
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

export function settlementIdentitiesFromProof(): SettlementIdentity[] {
  const proof = recordedPlacementProof();
  return [
    {
      participantId: STEPPE_CAPITAL_ID,
      participantName: "Steppe Capital",
      solanaWallet: proof.investorWallet ?? null,
      wheatAta: proof.investorInstrumentAta ?? null,
      demoKztAta: proof.demoKzt?.investorAta ?? null,
      wheatAtaOnChain: null,
      demoKztAtaOnChain: null,
      status: "MAPPED_PROOF_ONLY",
      notes: "Mapped from primary placement proof PL-ISS001-0001.",
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
      solanaWallet: null,
      wheatAta: null,
      demoKztAta: null,
      wheatAtaOnChain: false,
      demoKztAtaOnChain: false,
      status: "NOT_MAPPED",
      notes:
        "No Solana wallet is assigned to Grain Desk / DEMO-TRADER-001. WHEAT and DEMO-KZT ATAs are not derived and are not claimed to exist.",
      requiredPhase5B2Steps: [
        "Designate a Grain Desk Solana wallet and persist the mapping.",
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
