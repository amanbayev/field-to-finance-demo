import { PublicKey } from "@solana/web3.js";
import {
  CONTRACT_PDA_SEED,
  REGISTRY_PDA_SEED,
} from "./config";

export type OnChainContractStatus =
  | "PendingVerification"
  | "Verified"
  | "Suspended";

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
  const status = decodeStatus(reader.u8());
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

function decodeStatus(value: number): OnChainContractStatus {
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
