#!/usr/bin/env node
/**
 * Development-only Devnet Token-2022 mint for WHEAT-2027.
 * Creates the mint account with 0 decimals and 0 supply. Does not mint tokens.
 * Never used by the public Next.js app.
 *
 * Does not change agricultural_registry, DACs, or POOL-WHEAT-2027-01.
 *
 * Usage (WSL):
 *   DEPLOYER_KEYPAIR=~/.config/solana/id.json \
 *   node solana/scripts/phase3-token-mint.mjs
 *
 * If a mint is already recorded, this script verifies it and exits.
 * Set FORCE_NEW_MINT=1 only for an explicit Devnet reset of this mint.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getMint,
} from "@solana/spl-token";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RECORD_PATH = path.join(
  ROOT,
  "src/adapters/blockchain/solana/recorded-token.json",
);

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const TOKEN_ID = "tok-wheat-2027";
const DECIMALS = 0;

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

function readRecord() {
  if (!fs.existsSync(RECORD_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(RECORD_PATH, "utf8"));
}

function writeRecord(record) {
  fs.writeFileSync(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`);
}

const deployerPath = expandHome(
  process.env.DEPLOYER_KEYPAIR || "~/.config/solana/id.json",
);
const deployer = loadKeypair(deployerPath);
const connection = new Connection(RPC, "confirmed");
const record = readRecord();
const existingMint = process.env.WHEAT_2027_MINT || record[TOKEN_ID]?.mint;
const forceNew = process.env.FORCE_NEW_MINT === "1";

console.log("RPC", RPC);
console.log("Token-2022", TOKEN_2022_PROGRAM_ID.toBase58());
console.log("Deployer", deployer.publicKey.toBase58());
console.log("Decimals", DECIMALS, "(1 token = 1 tonne)");

if (existingMint && !forceNew) {
  const mint = new PublicKey(existingMint);
  const state = await getMint(
    connection,
    mint,
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  console.log("Mint already recorded", mint.toBase58());
  console.log("Supply", state.supply.toString());
  if (state.supply !== 0n) {
    throw new Error("Recorded mint supply is not 0. Do not proceed.");
  }
  console.log("Do not recreate. FORCE_NEW_MINT=1 is required to make a new mint.");
  process.exit(0);
}

const mint = await createMint(
  connection,
  deployer,
  deployer.publicKey,
  deployer.publicKey,
  DECIMALS,
  undefined,
  { commitment: "confirmed" },
  TOKEN_2022_PROGRAM_ID,
);

const state = await getMint(
  connection,
  mint,
  "confirmed",
  TOKEN_2022_PROGRAM_ID,
);

if (state.supply !== 0n) {
  throw new Error(
    `Refusing to record mint ${mint.toBase58()}: supply is ${state.supply.toString()}, expected 0.`,
  );
}

const signatures = await connection.getSignaturesForAddress(mint, { limit: 5 });
const createSignature = signatures[0]?.signature;

record[TOKEN_ID] = {
  mint: mint.toBase58(),
  createSignature: createSignature ?? "",
  decimals: DECIMALS,
  tokenProgramId: TOKEN_2022_PROGRAM_ID.toBase58(),
  supply: Number(state.supply),
};

writeRecord(record);

console.log("Mint", mint.toBase58());
console.log("Supply", state.supply.toString());
console.log("Create tx", createSignature ?? "(not in signature history yet)");
console.log(
  "Explorer",
  `https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`,
);
console.log("Recorded", RECORD_PATH);
