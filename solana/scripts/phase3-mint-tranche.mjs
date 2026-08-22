#!/usr/bin/env node
/**
 * Development-only Devnet mint of WHEAT-2027 tranche ISS-001.
 * Mints to the Registrar holding ATA. Does not place tokens with investors.
 * Never used by the public Next.js app.
 *
 * Outstanding supply cannot exceed 8,300 t eligible coverage.
 * Default tranche is 1,000 t (1 token = 1 tonne, 0 decimals).
 *
 * Does not change agricultural_registry, DACs, or POOL-WHEAT-2027-01.
 *
 * Usage (WSL):
 *   DEPLOYER_KEYPAIR=~/.config/solana/id.json \
 *   node solana/scripts/phase3-mint-tranche.mjs
 *
 * If ISS-001 is already recorded, this script verifies supply and exits.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RECORD_PATH = path.join(
  ROOT,
  "src/adapters/blockchain/solana/recorded-token.json",
);

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const TOKEN_ID = "tok-wheat-2027";
const TRANCHE_ID = process.env.TRANCHE_ID || "ISS-001";
const VOLUME = Number(process.env.TRANCHE_TONNES || "1000");
const ELIGIBLE_COVERAGE = 8300;

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
    throw new Error(`Missing mint record at ${RECORD_PATH}`);
  }
  return JSON.parse(fs.readFileSync(RECORD_PATH, "utf8"));
}

function writeRecord(record) {
  fs.writeFileSync(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`);
}

if (!Number.isInteger(VOLUME) || VOLUME <= 0) {
  throw new Error("TRANCHE_TONNES must be a positive integer.");
}

const deployerPath = expandHome(
  process.env.DEPLOYER_KEYPAIR || "~/.config/solana/id.json",
);
const deployer = loadKeypair(deployerPath);
const connection = new Connection(RPC, "confirmed");
const record = readRecord();
const token = record[TOKEN_ID];
if (!token?.mint) {
  throw new Error("Token-2022 mint is not recorded. Run phase3-token-mint.mjs first.");
}

const mint = new PublicKey(token.mint);
const state = await getMint(
  connection,
  mint,
  "confirmed",
  TOKEN_2022_PROGRAM_ID,
);
const supply = Number(state.supply);
const remaining = Math.max(0, ELIGIBLE_COVERAGE - supply);
const tranches = Array.isArray(token.tranches) ? token.tranches : [];
const existing = tranches.find((item) => item.id === TRANCHE_ID);

console.log("RPC", RPC);
console.log("Mint", mint.toBase58());
console.log("Deployer", deployer.publicKey.toBase58());
console.log("Tranche", TRANCHE_ID, VOLUME, "t");
console.log("On-chain supply", supply);
console.log("Remaining capacity", remaining);

if (existing) {
  if (supply < existing.volumeTonnes) {
    throw new Error(
      `Recorded ${TRANCHE_ID} is ${existing.volumeTonnes} t but on-chain supply is ${supply}.`,
    );
  }
  console.log("Tranche already recorded", existing.signature);
  console.log("Do not remint. Outstanding remains", supply);
  process.exit(0);
}

if (VOLUME > remaining) {
  throw new Error(
    `Tranche ${VOLUME} t exceeds remaining eligible coverage ${remaining} t.`,
  );
}

if (supply > 0) {
  throw new Error(
    `On-chain supply is already ${supply} and ${TRANCHE_ID} is not recorded. Refusing to mint.`,
  );
}

const ata = await getOrCreateAssociatedTokenAccount(
  connection,
  deployer,
  mint,
  deployer.publicKey,
  false,
  "confirmed",
  { commitment: "confirmed" },
  TOKEN_2022_PROGRAM_ID,
);

const signature = await mintTo(
  connection,
  deployer,
  mint,
  ata.address,
  deployer,
  BigInt(VOLUME),
  [],
  { commitment: "confirmed" },
  TOKEN_2022_PROGRAM_ID,
);

const after = await getMint(
  connection,
  mint,
  "confirmed",
  TOKEN_2022_PROGRAM_ID,
);
const newSupply = Number(after.supply);
if (newSupply !== supply + VOLUME) {
  throw new Error(
    `Unexpected supply ${newSupply} after minting ${VOLUME} onto ${supply}.`,
  );
}
if (newSupply > ELIGIBLE_COVERAGE) {
  throw new Error(
    `Supply ${newSupply} exceeds eligible coverage ${ELIGIBLE_COVERAGE}.`,
  );
}

record[TOKEN_ID] = {
  ...token,
  supply: newSupply,
  holder: ata.address.toBase58(),
  holderOwner: deployer.publicKey.toBase58(),
  tranches: [
    ...tranches,
    {
      id: TRANCHE_ID,
      volumeTonnes: VOLUME,
      signature,
      destination: ata.address.toBase58(),
    },
  ],
};
writeRecord(record);

console.log("Minted", VOLUME, "to", ata.address.toBase58());
console.log("Supply", newSupply);
console.log("Tx", signature);
console.log(
  "Explorer",
  `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
);
console.log("Recorded", RECORD_PATH);
