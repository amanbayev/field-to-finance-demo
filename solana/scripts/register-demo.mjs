#!/usr/bin/env node
/**
 * Development-only Devnet registration for DAC-2027-0001.
 * Reads keypairs from the filesystem. Never used by the public Next.js app.
 *
 * Usage (WSL):
 *   DEPLOYER_KEYPAIR=~/.config/solana/id.json \
 *   VERIFIER_KEYPAIR=~/.config/solana/verifier.json \
 *   PRODUCER_KEYPAIR=~/.config/solana/producer.json \
 *   node solana/scripts/register-demo.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IDL_PATH = path.join(
  ROOT,
  "src/adapters/blockchain/solana/agricultural_registry.json",
);

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.REGISTRY_PROGRAM_ID ||
    "E2jeQaTo7f5m78PkNfQ47srUK3EVexN2ApjEEoBaENjT",
);

function loadKeypair(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

function expandHome(filePath) {
  if (filePath.startsWith("~/")) {
    return path.join(process.env.HOME || "", filePath.slice(2));
  }
  return filePath;
}

function disc(idl, name) {
  const ix = idl.instructions.find((item) => item.name === name);
  if (!ix) {
    throw new Error(`IDL is missing instruction ${name}`);
  }
  return Buffer.from(ix.discriminator);
}

function encodeString(value) {
  const bytes = Buffer.from(value, "utf8");
  const out = Buffer.alloc(4 + bytes.length);
  out.writeUInt32LE(bytes.length, 0);
  bytes.copy(out, 4);
  return out;
}

function encodeU16(value) {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value, 0);
  return out;
}

function encodeU64(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value), 0);
  return out;
}

function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

async function main() {
  const deployerPath = expandHome(
    process.env.DEPLOYER_KEYPAIR || `${process.env.HOME}/.config/solana/id.json`,
  );
  const verifierPath = expandHome(
    process.env.VERIFIER_KEYPAIR ||
      `${process.env.HOME}/.config/solana/verifier.json`,
  );
  const producerPath = expandHome(
    process.env.PRODUCER_KEYPAIR ||
      `${process.env.HOME}/.config/solana/producer.json`,
  );

  const deployer = loadKeypair(deployerPath);
  const verifier = loadKeypair(verifierPath);
  const producer = loadKeypair(producerPath);
  const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
  const connection = new Connection(RPC, "confirmed");

  const registry = pda([Buffer.from("registry_config")]);
  const contractId = "DAC-2027-0001";
  const contract = pda([
    Buffer.from("digital_ag_contract"),
    Buffer.from(contractId),
  ]);

  console.log("cluster", RPC);
  console.log("program", PROGRAM_ID.toBase58());
  console.log("deployer", deployer.publicKey.toBase58());
  console.log("verifier", verifier.publicKey.toBase58());
  console.log("producer", producer.publicKey.toBase58());
  console.log("registry", registry.toBase58());
  console.log("contractPda", contract.toBase58());

  const registryInfo = await connection.getAccountInfo(registry);
  if (!registryInfo) {
    const data = Buffer.concat([
      disc(idl, "initialize"),
      verifier.publicKey.toBuffer(),
    ]);
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
        { pubkey: registry, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
    const sig = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(ix),
      [deployer],
      { commitment: "confirmed" },
    );
    console.log("initializeSignature", sig);
  } else {
    console.log("initializeSignature", "(already exists)");
  }

  const contractInfo = await connection.getAccountInfo(contract);
  if (!contractInfo) {
    const data = Buffer.concat([
      disc(idl, "create_contract"),
      encodeString(contractId),
      encodeString("PRODUCER-0001"),
      encodeString("Wheat"),
      encodeU16(2027),
      encodeU64(1240),
      encodeU64(2800),
      encodeString("Class 3"),
      encodeString("Akmola"),
    ]);
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: producer.publicKey, isSigner: true, isWritable: true },
        { pubkey: contract, isSigner: false, isWritable: true },
        { pubkey: registry, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });
    const sig = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(ix),
      [producer],
      { commitment: "confirmed" },
    );
    console.log("createSignature", sig);
  } else {
    console.log("createSignature", "(already exists)");
  }

  const latest = await connection.getAccountInfo(contract);
  if (!latest) {
    throw new Error("contract account missing after create");
  }
  const status = latest.data[/* skip until status: computed after strings */ 0];
  void status;
  const verifyIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: contract, isSigner: false, isWritable: true },
      { pubkey: verifier.publicKey, isSigner: true, isWritable: false },
      { pubkey: registry, isSigner: false, isWritable: false },
    ],
    data: disc(idl, "verify_contract"),
  });
  try {
    const sig = await sendAndConfirmTransaction(
      connection,
      new Transaction().add(verifyIx),
      [verifier],
      { commitment: "confirmed" },
    );
    console.log("verifySignature", sig);
  } catch (error) {
    console.log("verifySignature", String(error));
  }

  const sigs = await connection.getSignaturesForAddress(contract, { limit: 10 });
  console.log(
    "recentSignatures",
    sigs.map((item) => item.signature),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
