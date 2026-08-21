#!/usr/bin/env node
/**
 * Development-only Devnet Phase 2 setup.
 * Registers DAC-2027-0002..0004, creates POOL-WHEAT-2027-01, allocates volume,
 * and anchors the coverage snapshot hash. Never used by the public Next.js app.
 *
 * Usage (WSL):
 *   DEPLOYER_KEYPAIR=~/.config/solana/id.json \
 *   VERIFIER_KEYPAIR=~/.config/solana/verifier.json \
 *   PRODUCER_KEYPAIR=~/.config/solana/producer.json \
 *   node solana/scripts/phase2-devnet.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
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

const POOL_ID = "POOL-WHEAT-2027-01";
const CONTRACTS = [
  {
    id: "DAC-2027-0002",
    producerReference: "PRODUCER-0002",
    fieldAreaHectares: 1050,
    expectedVolumeTonnes: 2400,
    region: "Kostanay",
  },
  {
    id: "DAC-2027-0003",
    producerReference: "PRODUCER-0003",
    fieldAreaHectares: 1400,
    expectedVolumeTonnes: 3100,
    region: "North Kazakhstan",
  },
  {
    id: "DAC-2027-0004",
    producerReference: "PRODUCER-0004",
    fieldAreaHectares: 900,
    expectedVolumeTonnes: 1700,
    region: "Akmola",
  },
];

const ALL_ALLOCATIONS = [
  { id: "DAC-2027-0001", volume: 2800 },
  { id: "DAC-2027-0002", volume: 2400 },
  { id: "DAC-2027-0003", volume: 3100 },
  { id: "DAC-2027-0004", volume: 1700 },
];

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

async function send(connection, ix, signers) {
  return sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    signers,
    { commitment: "confirmed" },
  );
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function loadCoverage() {
  const calculatedAt = "2026-08-21T12:00:00.000Z";
  const adjustments = [
    {
      type: "Producer",
      key: "producer",
      label: "Producer Risk",
      basisPoints: -500,
      source: "DEMO / SIMULATED",
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-PRODUCER-WHEAT-2027",
    },
    {
      type: "Weather",
      key: "weather",
      label: "Weather / Satellite",
      basisPoints: -300,
      source: "DEMO / SIMULATED",
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-WEATHER-WHEAT-2027",
    },
    {
      type: "RegionalConcentration",
      key: "concentration",
      label: "Regional Concentration",
      basisPoints: -400,
      source: "DEMO / SIMULATED",
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-CONC-WHEAT-2027",
    },
    {
      type: "Quality",
      key: "quality",
      label: "Quality",
      basisPoints: -200,
      source: "DEMO / SIMULATED",
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-QUALITY-WHEAT-2027",
    },
    {
      type: "Insurance",
      key: "insurance",
      label: "Insurance",
      basisPoints: 200,
      source: "DEMO / SIMULATED",
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-INS-WHEAT-2027",
    },
    {
      type: "Issuer",
      key: "issuer",
      label: "Issuer Risk",
      basisPoints: -500,
      source: "DEMO / SIMULATED",
      status: "DEMO_SIMULATED",
      lastUpdated: calculatedAt,
      evidenceReference: "SIM-ISSUER-WHEAT-2027",
    },
  ];
  const netBps = adjustments.reduce((sum, item) => sum + item.basisPoints, 0);
  const totalHaircutBps = Math.max(0, -netBps);
  const grossVolumeTonnes = 10_000;
  const eligibleVolumeTonnes = Math.floor(
    (grossVolumeTonnes * (10_000 - totalHaircutBps)) / 10_000,
  );
  const snapshot = {
    poolId: POOL_ID,
    grossVolumeTonnes,
    eligibleVolumeTonnes,
    totalHaircutBps,
    riskAdjustments: adjustments,
    calculatedAt,
    version: 1,
  };
  const canonicalJson = JSON.stringify(sortKeys(snapshot));
  const digest = createHash("sha256").update(canonicalJson, "utf8").digest();
  return {
    snapshot,
    canonicalJson,
    snapshotHash: new Uint8Array(digest),
    snapshotHashHex: digest.toString("hex"),
  };
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
  const pool = pda([Buffer.from("contract_pool"), Buffer.from(POOL_ID)]);

  console.log("cluster", RPC);
  console.log("program", PROGRAM_ID.toBase58());
  console.log("deployer", deployer.publicKey.toBase58());
  console.log("poolPda", pool.toBase58());

  const evidence = {
    contracts: {},
    pool: { id: POOL_ID, pda: pool.toBase58() },
  };

  for (const item of CONTRACTS) {
    const contract = pda([
      Buffer.from("digital_ag_contract"),
      Buffer.from(item.id),
    ]);
    console.log(item.id, "pda", contract.toBase58());
    const existing = await connection.getAccountInfo(contract);
    let createSignature = "(already exists)";
    if (!existing) {
      const data = Buffer.concat([
        disc(idl, "create_contract"),
        encodeString(item.id),
        encodeString(item.producerReference),
        encodeString("Wheat"),
        encodeU16(2027),
        encodeU64(item.fieldAreaHectares),
        encodeU64(item.expectedVolumeTonnes),
        encodeString("Class 3"),
        encodeString(item.region),
      ]);
      createSignature = await send(
        connection,
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: producer.publicKey, isSigner: true, isWritable: true },
            { pubkey: contract, isSigner: false, isWritable: true },
            { pubkey: registry, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data,
        }),
        [producer],
      );
    }

    let verifySignature = "(already verified)";
    try {
      verifySignature = await send(
        connection,
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: contract, isSigner: false, isWritable: true },
            { pubkey: verifier.publicKey, isSigner: true, isWritable: false },
            { pubkey: registry, isSigner: false, isWritable: false },
          ],
          data: disc(idl, "verify_contract"),
        }),
        [verifier],
      );
    } catch (error) {
      const message = String(error);
      if (message.includes("AlreadyVerified") || message.includes("0x177f")) {
        verifySignature = "(already verified)";
      } else {
        verifySignature = message;
      }
    }

    evidence.contracts[item.id] = {
      pda: contract.toBase58(),
      createSignature,
      verifySignature,
    };
    console.log(item.id, "create", createSignature);
    console.log(item.id, "verify", verifySignature);
  }

  const existingPool = await connection.getAccountInfo(pool);
  let poolCreateSignature = "(already exists)";
  if (!existingPool) {
    const data = Buffer.concat([
      disc(idl, "create_pool"),
      encodeString(POOL_ID),
      encodeString("Wheat"),
      encodeU16(2027),
    ]);
    poolCreateSignature = await send(
      connection,
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
          { pubkey: pool, isSigner: false, isWritable: true },
          { pubkey: registry, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        data,
      }),
      [deployer],
    );
  }
  evidence.pool.createSignature = poolCreateSignature;
  console.log("poolCreate", poolCreateSignature);

  evidence.allocations = {};
  for (const item of ALL_ALLOCATIONS) {
    const contract = pda([
      Buffer.from("digital_ag_contract"),
      Buffer.from(item.id),
    ]);
    const allocation = pda([
      Buffer.from("contract_allocation"),
      Buffer.from(item.id),
      Buffer.from(POOL_ID),
    ]);
    const index = pda([
      Buffer.from("allocation_index"),
      Buffer.from(item.id),
    ]);
    const existingAlloc = await connection.getAccountInfo(allocation);
    let allocateSignature = "(already exists)";
    if (!existingAlloc) {
      const data = Buffer.concat([
        disc(idl, "add_contract_to_pool"),
        encodeU64(item.volume),
      ]);
      allocateSignature = await send(
        connection,
        new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
            { pubkey: pool, isSigner: false, isWritable: true },
            { pubkey: contract, isSigner: false, isWritable: false },
            { pubkey: allocation, isSigner: false, isWritable: true },
            { pubkey: index, isSigner: false, isWritable: true },
            { pubkey: registry, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          ],
          data,
        }),
        [deployer],
      );
    }
    evidence.allocations[item.id] = {
      pda: allocation.toBase58(),
      indexPda: index.toBase58(),
      volume: item.volume,
      allocateSignature,
    };
    console.log("allocate", item.id, allocateSignature);
  }

  const coverage = loadCoverage();
  if (coverage.snapshot.eligibleVolumeTonnes !== 8300) {
    throw new Error(
      `coverage engine expected 8300 t, got ${coverage.snapshot.eligibleVolumeTonnes}`,
    );
  }
  const hashBytes = Buffer.from(coverage.snapshotHash);
  const coverageData = Buffer.concat([
    disc(idl, "update_pool_coverage"),
    encodeU64(coverage.snapshot.eligibleVolumeTonnes),
    encodeU16(coverage.snapshot.totalHaircutBps),
    hashBytes,
  ]);
  const coverageSignature = await send(
    connection,
    new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: deployer.publicKey, isSigner: true, isWritable: false },
        { pubkey: pool, isSigner: false, isWritable: true },
        { pubkey: registry, isSigner: false, isWritable: false },
      ],
      data: coverageData,
    }),
    [deployer],
  );
  evidence.pool.coverageSignature = coverageSignature;
  evidence.pool.snapshotHashHex = coverage.snapshotHashHex;
  evidence.pool.canonicalJson = coverage.canonicalJson;
  console.log("coverageHash", coverage.snapshotHashHex);
  console.log("coverageUpdate", coverageSignature);

  try {
    const activateSignature = await send(
      connection,
      new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: deployer.publicKey, isSigner: true, isWritable: false },
          { pubkey: pool, isSigner: false, isWritable: true },
          { pubkey: registry, isSigner: false, isWritable: false },
        ],
        data: Buffer.concat([disc(idl, "set_pool_status"), Buffer.from([1])]),
      }),
      [deployer],
    );
    evidence.pool.activateSignature = activateSignature;
    console.log("activate", activateSignature);
  } catch (error) {
    evidence.pool.activateSignature = String(error);
    console.log("activate", String(error));
  }

  const dac1 = pda([
    Buffer.from("digital_ag_contract"),
    Buffer.from("DAC-2027-0001"),
  ]);
  const dac1Info = await connection.getAccountInfo(dac1);
  evidence.backwardCompatibility = {
    contractId: "DAC-2027-0001",
    pda: dac1.toBase58(),
    readable: Boolean(dac1Info),
    dataLength: dac1Info?.data.length ?? 0,
  };
  console.log("dac1Readable", evidence.backwardCompatibility);

  const outPath = path.join(ROOT, "solana/scripts/phase2-evidence.json");
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log("wrote", outPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
