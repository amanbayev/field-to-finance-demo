#!/usr/bin/env node
/**
 * Development-only Devnet primary placement for PL-ISS001-0001.
 * Atomic DvP: 10 WHEAT-2027 vs 1,000,000 DEMO-KZT.
 * Never used by the public Next.js app. Does not mint WHEAT-2027.
 *
 * Usage (WSL):
 *   node solana/scripts/phase4-primary-placement.mjs
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
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
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const IDL_PATH = path.join(
  ROOT,
  "src/adapters/blockchain/solana/agricultural_market.json",
);
const TOKEN_RECORD_PATH = path.join(
  ROOT,
  "src/adapters/blockchain/solana/recorded-token.json",
);
const MANIFEST_PATH = path.join(
  ROOT,
  "src/adapters/blockchain/solana/placement-manifest.json",
);
const RECORD_PATH = path.join(
  ROOT,
  "src/adapters/blockchain/solana/recorded-placement.json",
);

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const MARKET_PROGRAM_ID = new PublicKey(
  process.env.MARKET_PROGRAM_ID ||
    "9mMsbTZTK2RZW1jSjyDLF6Cs12oECg53mzhsDXeyRXst",
);
const POOL_PDA = new PublicKey("8A1KhRzo6PciKQ3FVNZ2W52F5hhCw8nkTcZHiZydE89E");
const TOKEN_ID = "tok-wheat-2027";
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

function encodeU64(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value), 0);
  return out;
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function pda(seeds) {
  return PublicKey.findProgramAddressSync(seeds, MARKET_PROGRAM_ID)[0];
}

function ed25519PrivateKey(secretKey) {
  return createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      Buffer.from(secretKey.subarray(0, 32)),
    ]),
    format: "der",
    type: "pkcs8",
  });
}

function ed25519PublicKey(publicKeyBytes) {
  return createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(publicKeyBytes),
    ]),
    format: "der",
    type: "spki",
  });
}

function verifyWalletOwnership(investor) {
  const nonce = `F2F-${Date.now()}`;
  const message = Buffer.from(
    [
      "Field to Finance wallet ownership",
      "Participant: INVESTOR-0001",
      `Wallet: ${investor.publicKey.toBase58()}`,
      `Nonce: ${nonce}`,
      "Network: solana-devnet",
    ].join("\n"),
    "utf8",
  );
  const signature = sign(null, message, ed25519PrivateKey(investor.secretKey));
  const ok = verify(
    null,
    message,
    ed25519PublicKey(investor.publicKey.toBytes()),
    signature,
  );
  if (!ok) {
    throw new Error("Wallet ownership signature did not verify.");
  }
  return {
    participantReference: "INVESTOR-0001",
    wallet: investor.publicKey.toBase58(),
    nonce,
    messageUtf8: message.toString("utf8"),
    signatureBase64: signature.toString("base64"),
    algorithm: "ed25519",
    verified: true,
    simulatedKyc: false,
  };
}

async function airdropIfNeeded(connection, pubkey, minLamports) {
  const balance = await connection.getBalance(pubkey, "confirmed");
  if (balance >= minLamports) {
    return balance;
  }
  try {
    const sig = await connection.requestAirdrop(pubkey, minLamports - balance);
    await connection.confirmTransaction(sig, "confirmed");
  } catch (error) {
    console.log("airdrop skipped", error instanceof Error ? error.message : error);
  }
  return connection.getBalance(pubkey, "confirmed");
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeRecord(record) {
  fs.writeFileSync(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`);
}

const deployer = loadKeypair(
  expandHome(process.env.DEPLOYER_KEYPAIR || "~/.config/solana/id.json"),
);
const investor = loadKeypair(
  expandHome(process.env.INVESTOR_KEYPAIR || "~/.config/solana/investor-0001.json"),
);
const settlementOwner = loadKeypair(
  expandHome(
    process.env.SETTLEMENT_KEYPAIR ||
      "~/.config/solana/issuer-settlement-001.json",
  ),
);
const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));
const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
const tokenRecord = JSON.parse(fs.readFileSync(TOKEN_RECORD_PATH, "utf8"));
const wheat = tokenRecord[TOKEN_ID];
if (!wheat?.mint || !wheat.holder) {
  throw new Error("WHEAT-2027 mint/holder is not recorded. Phase 3 must remain intact.");
}

const connection = new Connection(RPC, "confirmed");
const wheatMint = new PublicKey(wheat.mint);
const registrarAta = new PublicKey(wheat.holder);
const marketConfig = pda([Buffer.from("market_config")]);
const placementPda = pda([
  Buffer.from("primary_placement"),
  Buffer.from(manifest.placementId),
]);
const existing = readJson(RECORD_PATH, {});

console.log("RPC", RPC);
console.log("Market program", MARKET_PROGRAM_ID.toBase58());
console.log("Registrar", deployer.publicKey.toBase58());
console.log("Investor", investor.publicKey.toBase58());
console.log("Settlement owner", settlementOwner.publicKey.toBase58());
console.log("WHEAT mint", wheatMint.toBase58());
console.log("Placement PDA", placementPda.toBase58());

const programInfo = await connection.getAccountInfo(MARKET_PROGRAM_ID, "confirmed");
if (!programInfo?.executable) {
  throw new Error("agricultural_market is not deployed on Devnet.");
}

const wheatState = await getMint(
  connection,
  wheatMint,
  "confirmed",
  TOKEN_2022_PROGRAM_ID,
);
const wheatSupply = Number(wheatState.supply);
if (wheatSupply !== 1000) {
  throw new Error(`Refusing to proceed: WHEAT-2027 supply is ${wheatSupply}, expected 1000.`);
}
if (wheatSupply > ELIGIBLE_COVERAGE) {
  throw new Error("Minted supply exceeds eligible coverage.");
}

const registrarBefore = await getAccount(
  connection,
  registrarAta,
  "confirmed",
  TOKEN_2022_PROGRAM_ID,
);
const registrarBalance = Number(registrarBefore.amount);
console.log("Pre-placement supply", wheatSupply);
console.log("Pre-placement registrar", registrarBalance);

const walletProof = existing.walletOwnership?.verified
  ? existing.walletOwnership
  : verifyWalletOwnership(investor);
console.log("Wallet ownership verified", walletProof.verified);

await airdropIfNeeded(connection, deployer.publicKey, 2_000_000_000);
await airdropIfNeeded(connection, investor.publicKey, 500_000_000);

let settlementMintPk;
let demoKztCreateSignature = existing.demoKzt?.createSignature ?? "";
if (existing.demoKzt?.mint) {
  settlementMintPk = new PublicKey(existing.demoKzt.mint);
  const demoState = await getMint(
    connection,
    settlementMintPk,
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  if (demoState.decimals !== 0) {
    throw new Error("Recorded DEMO-KZT decimals are not 0.");
  }
  console.log("DEMO-KZT mint already recorded", settlementMintPk.toBase58());
} else {
  settlementMintPk = await createMint(
    connection,
    deployer,
    deployer.publicKey,
    deployer.publicKey,
    0,
    undefined,
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID,
  );
  const history = await connection.getSignaturesForAddress(settlementMintPk, {
    limit: 3,
  });
  demoKztCreateSignature = history[0]?.signature ?? "";
  console.log("DEMO-KZT mint", settlementMintPk.toBase58());
}

const investorKztAta = await getOrCreateAssociatedTokenAccount(
  connection,
  deployer,
  settlementMintPk,
  investor.publicKey,
  false,
  "confirmed",
  { commitment: "confirmed" },
  TOKEN_2022_PROGRAM_ID,
);
const issuerKztAta = await getOrCreateAssociatedTokenAccount(
  connection,
  deployer,
  settlementMintPk,
  settlementOwner.publicKey,
  false,
  "confirmed",
  { commitment: "confirmed" },
  TOKEN_2022_PROGRAM_ID,
);
const investorWheatAta = getAssociatedTokenAddressSync(
  wheatMint,
  investor.publicKey,
  false,
  TOKEN_2022_PROGRAM_ID,
);

const neededKzt = BigInt(manifest.totalSettlementAmount);
if (investorKztAta.amount < neededKzt) {
  const topUp = neededKzt - investorKztAta.amount;
  const mintSig = await mintTo(
    connection,
    deployer,
    settlementMintPk,
    investorKztAta.address,
    deployer,
    topUp,
    [],
    { commitment: "confirmed" },
    TOKEN_2022_PROGRAM_ID,
  );
  console.log("DEMO-KZT demo-infra mint to investor", mintSig);
  console.log("This is Devnet infrastructure, not capital raised.");
}

const configInfo = await connection.getAccountInfo(marketConfig, "confirmed");
let initializeSignature = existing.initializeSignature ?? "";
if (!configInfo) {
  const data = Buffer.concat([
    disc(idl, "initialize_market"),
    encodeString(manifest.issuanceId),
    encodeU64(manifest.simulatedUnitPrice),
  ]);
  const ix = new TransactionInstruction({
    programId: MARKET_PROGRAM_ID,
    keys: [
      { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
      { pubkey: marketConfig, isSigner: false, isWritable: true },
      { pubkey: POOL_PDA, isSigner: false, isWritable: false },
      { pubkey: wheatMint, isSigner: false, isWritable: false },
      { pubkey: settlementMintPk, isSigner: false, isWritable: false },
      { pubkey: settlementOwner.publicKey, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  initializeSignature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    [deployer],
    { commitment: "confirmed" },
  );
  console.log("initialize_market", initializeSignature);
} else {
  console.log("market config already exists", marketConfig.toBase58());
}

const placementInfo = await connection.getAccountInfo(placementPda, "confirmed");
let dvpSignature = existing.dvpSignature ?? "";
if (placementInfo) {
  console.log("Placement already settled", placementPda.toBase58());
  if (!dvpSignature) {
    const history = await connection.getSignaturesForAddress(placementPda, {
      limit: 5,
    });
    dvpSignature = history[0]?.signature ?? "";
  }
} else {
  if (registrarBalance < manifest.quantity) {
    throw new Error(
      `Registrar inventory ${registrarBalance} is below placement quantity ${manifest.quantity}.`,
    );
  }
  const data = Buffer.concat([
    disc(idl, "settle_primary_placement"),
    encodeString(manifest.placementId),
    encodeString(manifest.issuanceId),
    encodeU64(manifest.quantity),
    encodeU64(manifest.simulatedUnitPrice),
    encodeU64(manifest.totalSettlementAmount),
    sha256("INVESTOR-0001"),
    sha256("DEMO-COMPLIANCE:INVESTOR-0001:ELIGIBLE"),
  ]);
  const refreshedInvestorKzt = await getAccount(
    connection,
    investorKztAta.address,
    "confirmed",
    TOKEN_2022_PROGRAM_ID,
  );
  const ix = new TransactionInstruction({
    programId: MARKET_PROGRAM_ID,
    keys: [
      { pubkey: deployer.publicKey, isSigner: true, isWritable: true },
      { pubkey: investor.publicKey, isSigner: true, isWritable: false },
      { pubkey: marketConfig, isSigner: false, isWritable: false },
      { pubkey: placementPda, isSigner: false, isWritable: true },
      { pubkey: POOL_PDA, isSigner: false, isWritable: false },
      { pubkey: wheatMint, isSigner: false, isWritable: false },
      { pubkey: settlementMintPk, isSigner: false, isWritable: false },
      { pubkey: registrarAta, isSigner: false, isWritable: true },
      { pubkey: investorWheatAta, isSigner: false, isWritable: true },
      { pubkey: refreshedInvestorKzt.address, isSigner: false, isWritable: true },
      { pubkey: issuerKztAta.address, isSigner: false, isWritable: true },
      { pubkey: settlementOwner.publicKey, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
  dvpSignature = await sendAndConfirmTransaction(
    connection,
    new Transaction().add(ix),
    [deployer, investor],
    { commitment: "confirmed" },
  );
  console.log("DvP", dvpSignature);
}

const supplyAfter = Number(
  (
    await getMint(connection, wheatMint, "confirmed", TOKEN_2022_PROGRAM_ID)
  ).supply,
);
const registrarAfter = Number(
  (
    await getAccount(connection, registrarAta, "confirmed", TOKEN_2022_PROGRAM_ID)
  ).amount,
);
const investorWheatAfter = Number(
  (
    await getAccount(
      connection,
      investorWheatAta,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    )
  ).amount,
);
const investorKztAfter = Number(
  (
    await getAccount(
      connection,
      investorKztAta.address,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    )
  ).amount,
);
const issuerKztAfter = Number(
  (
    await getAccount(
      connection,
      issuerKztAta.address,
      "confirmed",
      TOKEN_2022_PROGRAM_ID,
    )
  ).amount,
);

if (supplyAfter !== 1000) {
  throw new Error(`Total supply changed to ${supplyAfter}. Phase 4 must not mint.`);
}
if (registrarAfter !== 990) {
  throw new Error(`Registrar WHEAT balance is ${registrarAfter}, expected 990.`);
}
if (investorWheatAfter !== 10) {
  throw new Error(`Investor WHEAT balance is ${investorWheatAfter}, expected 10.`);
}

const deployHistory = await connection.getSignaturesForAddress(
  MARKET_PROGRAM_ID,
  { limit: 8 },
);
const deploySignature =
  existing.marketProgramDeploySignature ||
  deployHistory.at(-1)?.signature ||
  deployHistory[0]?.signature ||
  "";

const record = {
  status: "settled",
  placementId: manifest.placementId,
  issuanceId: manifest.issuanceId,
  instrumentId: TOKEN_ID,
  instrumentSymbol: "WHEAT-2027",
  investorReference: "INVESTOR-0001",
  investorWallet: investor.publicKey.toBase58(),
  issuerSettlementReference: "ISSUER-SETTLEMENT-001",
  issuerSettlementOwner: settlementOwner.publicKey.toBase58(),
  issuerSettlementLabel: "Technical Demo Settlement Account",
  quantity: 10,
  simulatedUnitPrice: manifest.simulatedUnitPrice,
  totalSettlementAmount: manifest.totalSettlementAmount,
  priceDisclaimer: "Simulation Only · Not Commercial Terms",
  settlementAssetDisclaimer: "DEMO SETTLEMENT ASSET · NO MONETARY VALUE",
  marketProgramId: MARKET_PROGRAM_ID.toBase58(),
  marketProgramDeploySignature: deploySignature,
  marketConfigPda: marketConfig.toBase58(),
  placementPda: placementPda.toBase58(),
  poolPda: POOL_PDA.toBase58(),
  instrumentMint: wheatMint.toBase58(),
  registrarInstrumentAta: registrarAta.toBase58(),
  investorInstrumentAta: investorWheatAta.toBase58(),
  initializeSignature,
  dvpSignature,
  mintedSupply: supplyAfter,
  registrarInventory: registrarAfter,
  placed: 10,
  circulating: investorWheatAfter,
  burned: 0,
  demoKzt: {
    mint: settlementMintPk.toBase58(),
    createSignature: demoKztCreateSignature,
    decimals: 0,
    investorAta: investorKztAta.address.toBase58(),
    issuerSettlementAta: issuerKztAta.address.toBase58(),
    investorBalance: investorKztAfter,
    issuerSettlementBalance: issuerKztAfter,
  },
  walletOwnership: walletProof,
  compliance: {
    providerLabel: "Demo Compliance Provider",
    simulated: true,
    identityEntityCheck: "Passed / Eligible",
    sanctions: "Clear",
    kyt: "Low Risk",
    eligibility: "Eligible",
    walletOwnership: "Verified",
    referenceHashHex: sha256("DEMO-COMPLIANCE:INVESTOR-0001:ELIGIBLE").toString(
      "hex",
    ),
  },
  investorReferenceHashHex: sha256("INVESTOR-0001").toString("hex"),
};

writeRecord(record);
console.log("Independent verification");
console.log(" supply", supplyAfter);
console.log(" registrar", registrarAfter);
console.log(" investor wheat", investorWheatAfter);
console.log(" investor DEMO-KZT", investorKztAfter);
console.log(" settlement DEMO-KZT", issuerKztAfter);
console.log(" recorded", RECORD_PATH);
console.log(
  " explorer dvp",
  `https://explorer.solana.com/tx/${dvpSignature}?cluster=devnet`,
);
