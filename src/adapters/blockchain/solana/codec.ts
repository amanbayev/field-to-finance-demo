import { PublicKey } from "@solana/web3.js";
import {
  ALLOCATION_INDEX_PDA_SEED,
  ALLOCATION_PDA_SEED,
  CONTRACT_PDA_SEED,
  MARKET_CONFIG_SEED,
  POOL_PDA_SEED,
  PRIMARY_PLACEMENT_SEED,
  SECONDARY_SETTLEMENT_SEED,
  REGISTRY_PDA_SEED,
} from "./config";

export type OnChainContractStatus =
  | "PendingVerification"
  | "Verified"
  | "Suspended";

export type OnChainPoolStatus = "Draft" | "Active" | "Suspended" | "Closed";

export type OnChainAllocationStatus = "Active" | "Released";

export interface OnChainDigitalAgriculturalContract {
  contractId: string;
  producerAuthority: string;
  producerReference: string;
  crop: string;
  season: number;
  fieldAreaHectares: number;
  expectedVolumeTonnes: number;
  qualityClass: string;
  region: string;
  status: OnChainContractStatus;
  createdAt: number;
  updatedAt: number;
  verificationAuthority: string;
  bump: number;
  pda: string;
  programId: string;
}

export interface OnChainContractPool {
  poolId: string;
  authority: string;
  crop: string;
  season: number;
  status: OnChainPoolStatus;
  grossVolumeTonnes: number;
  eligibleVolumeTonnes: number;
  coverageHaircutBps: number;
  coverageSnapshotHash: Uint8Array;
  coverageSnapshotHashHex: string;
  createdAt: number;
  updatedAt: number;
  contractCount: number;
  bump: number;
  pda: string;
  programId: string;
}

export interface OnChainContractAllocation {
  contractId: string;
  poolId: string;
  allocatedVolumeTonnes: number;
  status: OnChainAllocationStatus;
  createdAt: number;
  bump: number;
  pda: string;
  programId: string;
}

export interface OnChainAllocationIndex {
  contractId: string;
  allocatedVolumeTonnes: number;
  allocationCount: number;
  bump: number;
  pda: string;
  programId: string;
}

export function deriveContractPda(
  programId: PublicKey,
  contractId: string,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(CONTRACT_PDA_SEED), Buffer.from(contractId)],
    programId,
  )[0];
}

export function deriveRegistryPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(REGISTRY_PDA_SEED)],
    programId,
  )[0];
}

export function derivePoolPda(programId: PublicKey, poolId: string): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_PDA_SEED), Buffer.from(poolId)],
    programId,
  )[0];
}

export function deriveAllocationPda(
  programId: PublicKey,
  contractId: string,
  poolId: string,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(ALLOCATION_PDA_SEED),
      Buffer.from(contractId),
      Buffer.from(poolId),
    ],
    programId,
  )[0];
}

export function deriveAllocationIndexPda(
  programId: PublicKey,
  contractId: string,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(ALLOCATION_INDEX_PDA_SEED), Buffer.from(contractId)],
    programId,
  )[0];
}

export function deriveMarketConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MARKET_CONFIG_SEED)],
    programId,
  )[0];
}

export function derivePlacementPda(
  programId: PublicKey,
  placementId: string,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(PRIMARY_PLACEMENT_SEED), Buffer.from(placementId)],
    programId,
  )[0];
}

export function deriveSecondarySettlementPda(
  programId: PublicKey,
  tradeId: string,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(SECONDARY_SETTLEMENT_SEED), Buffer.from(tradeId)],
    programId,
  )[0];
}

export type OnChainPlacementStatus = "Settled";

export interface OnChainPrimaryPlacement {
  placementId: string;
  issuanceId: string;
  instrumentMint: string;
  investorWallet: string;
  investorReferenceHashHex: string;
  quantity: number;
  settlementMint: string;
  unitPrice: number;
  totalSettlementAmount: number;
  complianceReferenceHashHex: string;
  registrarAuthority: string;
  settledAt: number;
  status: OnChainPlacementStatus;
  bump: number;
  pda: string;
  programId: string;
}

export function decodePrimaryPlacementAccount(
  data: Buffer,
  pda: string,
  programId: string,
): OnChainPrimaryPlacement {
  const reader = new BorshReader(data);
  reader.bytes(8);
  const placementId = reader.string();
  const issuanceId = reader.string();
  const instrumentMint = reader.pubkey();
  const investorWallet = reader.pubkey();
  const investorReferenceHashHex = bytesToHex(new Uint8Array(reader.bytes(32)));
  const quantity = reader.u64();
  const settlementMint = reader.pubkey();
  const unitPrice = reader.u64();
  const totalSettlementAmount = reader.u64();
  const complianceReferenceHashHex = bytesToHex(
    new Uint8Array(reader.bytes(32)),
  );
  const registrarAuthority = reader.pubkey();
  const settledAt = reader.i64();
  const status = decodePlacementStatus(reader.u8());
  const bump = reader.u8();
  return {
    placementId,
    issuanceId,
    instrumentMint,
    investorWallet,
    investorReferenceHashHex,
    quantity,
    settlementMint,
    unitPrice,
    totalSettlementAmount,
    complianceReferenceHashHex,
    registrarAuthority,
    settledAt,
    status,
    bump,
    pda,
    programId,
  };
}

function decodePlacementStatus(value: number): OnChainPlacementStatus {
  if (value !== 0) {
    throw new Error("invalid on-chain placement status");
  }
  return "Settled";
}

export function decodeContractAccount(
  data: Buffer,
  pda: string,
  programId: string,
): OnChainDigitalAgriculturalContract {
  const reader = new BorshReader(data);
  reader.bytes(8);
  const contractId = reader.string();
  const producerAuthority = reader.pubkey();
  const producerReference = reader.string();
  const crop = reader.string();
  const season = reader.u16();
  const fieldAreaHectares = reader.u64();
  const expectedVolumeTonnes = reader.u64();
  const qualityClass = reader.string();
  const region = reader.string();
  const status = decodeContractStatus(reader.u8());
  const createdAt = reader.i64();
  const updatedAt = reader.i64();
  const verificationAuthority = reader.pubkey();
  const bump = reader.u8();

  return {
    contractId,
    producerAuthority,
    producerReference,
    crop,
    season,
    fieldAreaHectares,
    expectedVolumeTonnes,
    qualityClass,
    region,
    status,
    createdAt,
    updatedAt,
    verificationAuthority,
    bump,
    pda,
    programId,
  };
}

export function decodePoolAccount(
  data: Buffer,
  pda: string,
  programId: string,
): OnChainContractPool {
  const reader = new BorshReader(data);
  reader.bytes(8);
  const poolId = reader.string();
  const authority = reader.pubkey();
  const crop = reader.string();
  const season = reader.u16();
  const status = decodePoolStatus(reader.u8());
  const grossVolumeTonnes = reader.u64();
  const eligibleVolumeTonnes = reader.u64();
  const coverageHaircutBps = reader.u16();
  const coverageSnapshotHash = new Uint8Array(reader.bytes(32));
  const createdAt = reader.i64();
  const updatedAt = reader.i64();
  const contractCount = reader.u16();
  const bump = reader.u8();

  return {
    poolId,
    authority,
    crop,
    season,
    status,
    grossVolumeTonnes,
    eligibleVolumeTonnes,
    coverageHaircutBps,
    coverageSnapshotHash,
    coverageSnapshotHashHex: bytesToHex(coverageSnapshotHash),
    createdAt,
    updatedAt,
    contractCount,
    bump,
    pda,
    programId,
  };
}

export function decodeAllocationAccount(
  data: Buffer,
  pda: string,
  programId: string,
): OnChainContractAllocation {
  const reader = new BorshReader(data);
  reader.bytes(8);
  const contractId = reader.string();
  const poolId = reader.string();
  const allocatedVolumeTonnes = reader.u64();
  const status = decodeAllocationStatus(reader.u8());
  const createdAt = reader.i64();
  const bump = reader.u8();

  return {
    contractId,
    poolId,
    allocatedVolumeTonnes,
    status,
    createdAt,
    bump,
    pda,
    programId,
  };
}

export function decodeAllocationIndexAccount(
  data: Buffer,
  pda: string,
  programId: string,
): OnChainAllocationIndex {
  const reader = new BorshReader(data);
  reader.bytes(8);
  const contractId = reader.string();
  const allocatedVolumeTonnes = reader.u64();
  const allocationCount = reader.u16();
  const bump = reader.u8();

  return {
    contractId,
    allocatedVolumeTonnes,
    allocationCount,
    bump,
    pda,
    programId,
  };
}

function decodeContractStatus(value: number): OnChainContractStatus {
  switch (value) {
    case 0:
      return "PendingVerification";
    case 1:
      return "Verified";
    case 2:
      return "Suspended";
    default:
      throw new Error("invalid on-chain contract status");
  }
}

function decodePoolStatus(value: number): OnChainPoolStatus {
  switch (value) {
    case 0:
      return "Draft";
    case 1:
      return "Active";
    case 2:
      return "Suspended";
    case 3:
      return "Closed";
    default:
      throw new Error("invalid on-chain pool status");
  }
}

function decodeAllocationStatus(value: number): OnChainAllocationStatus {
  switch (value) {
    case 0:
      return "Active";
    case 1:
      return "Released";
    default:
      throw new Error("invalid on-chain allocation status");
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

class BorshReader {
  private offset = 0;

  constructor(private readonly data: Buffer) {}

  bytes(length: number): Buffer {
    const slice = this.data.subarray(this.offset, this.offset + length);
    if (slice.length !== length) {
      throw new Error("unexpected end of on-chain account data");
    }
    this.offset += length;
    return Buffer.from(slice);
  }

  u8(): number {
    const value = this.data.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  u16(): number {
    const value = this.data.readUInt16LE(this.offset);
    this.offset += 2;
    return value;
  }

  u64(): number {
    const value = Number(this.data.readBigUInt64LE(this.offset));
    this.offset += 8;
    return value;
  }

  i64(): number {
    const value = Number(this.data.readBigInt64LE(this.offset));
    this.offset += 8;
    return value;
  }

  string(): string {
    const length = this.data.readUInt32LE(this.offset);
    this.offset += 4;
    return this.bytes(length).toString("utf8");
  }

  pubkey(): string {
    return new PublicKey(this.bytes(32)).toBase58();
  }
}
