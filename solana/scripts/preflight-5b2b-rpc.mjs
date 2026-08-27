import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const placement = JSON.parse(
  readFileSync(join(root, "src/adapters/blockchain/solana/recorded-placement.json"), "utf8"),
);
const identities = readFileSync(
  join(root, "src/data/market-core/settlement-identities.ts"),
  "utf8",
);
const idl = JSON.parse(
  readFileSync(join(root, "src/adapters/blockchain/solana/agricultural_market.json"), "utf8"),
);

function grab(source, marker) {
  const idx = source.indexOf(marker);
  if (idx < 0) return null;
  const match = source.slice(idx + marker.length).match(/"([^"]+)"/);
  return match ? match[1] : null;
}

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM = placement.marketProgramId || idl.address;
const WHEAT = placement.instrumentMint;
const KZT = placement.demoKzt.mint;
const STEPPE = placement.investorWallet;
const GRAIN = grab(identities, "GRAIN_DESK_SOLANA_WALLET");
const TRADE_ID = "TRD-SEED-001";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const slot = await connection.getSlot("confirmed");
  const programPk = new PublicKey(PROGRAM);
  const program = await connection.getAccountInfo(programPk, "confirmed");
  let programData = null;
  if (program && program.data.length >= 36) {
    const programDataPk = new PublicKey(program.data.subarray(4, 36));
    const pd = await connection.getAccountInfo(programDataPk, "confirmed");
    programData = {
      address: programDataPk.toBase58(),
      exists: Boolean(pd),
      dataLen: pd?.data.length ?? 0,
      upgradeAuthority:
        pd && pd.data.length >= 45 && pd.data[12] === 1
          ? new PublicKey(pd.data.subarray(13, 45)).toBase58()
          : null,
      upgradeable: Boolean(pd && pd.data.length >= 13 && pd.data[12] === 1),
    };
  }

  const wheat = await getMint(connection, new PublicKey(WHEAT), "confirmed", TOKEN_2022_PROGRAM_ID);
  const kzt = await getMint(connection, new PublicKey(KZT), "confirmed", TOKEN_2022_PROGRAM_ID);

  const [receiptPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("secondary_settlement"), Buffer.from(TRADE_ID)],
    programPk,
  );

  const derived = {
    steppeWheat: getAssociatedTokenAddressSync(
      new PublicKey(WHEAT),
      new PublicKey(STEPPE),
      false,
      TOKEN_2022_PROGRAM_ID,
    ).toBase58(),
    steppeKzt: getAssociatedTokenAddressSync(
      new PublicKey(KZT),
      new PublicKey(STEPPE),
      false,
      TOKEN_2022_PROGRAM_ID,
    ).toBase58(),
    grainWheat: getAssociatedTokenAddressSync(
      new PublicKey(WHEAT),
      new PublicKey(GRAIN),
      false,
      TOKEN_2022_PROGRAM_ID,
    ).toBase58(),
    grainKzt: getAssociatedTokenAddressSync(
      new PublicKey(KZT),
      new PublicKey(GRAIN),
      false,
      TOKEN_2022_PROGRAM_ID,
    ).toBase58(),
  };

  async function token(address) {
    try {
      const acc = await getAccount(
        connection,
        new PublicKey(address),
        "confirmed",
        TOKEN_2022_PROGRAM_ID,
      );
      return {
        exists: true,
        amount: acc.amount.toString(),
        owner: acc.owner.toBase58(),
        mint: acc.mint.toBase58(),
      };
    } catch {
      return { exists: false };
    }
  }

  async function sys(address) {
    const info = await connection.getAccountInfo(new PublicKey(address), "confirmed");
    if (!info) return { exists: false, lamports: 0 };
    return {
      exists: true,
      lamports: info.lamports,
      owner: info.owner.toBase58(),
      dataLen: info.data.length,
    };
  }

  const out = {
    slot,
    program: {
      address: PROGRAM,
      exists: Boolean(program),
      owner: program?.owner.toBase58() ?? null,
      executable: program?.executable ?? false,
      dataLen: program?.data.length ?? 0,
      programData,
    },
    wheat: {
      mint: WHEAT,
      decimals: wheat.decimals,
      supply: wheat.supply.toString(),
      mintAuthority: wheat.mintAuthority?.toBase58() ?? null,
      freezeAuthority: wheat.freezeAuthority?.toBase58() ?? null,
      tlvLength: wheat.tlvData.length,
    },
    demoKzt: {
      mint: KZT,
      decimals: kzt.decimals,
      supply: kzt.supply.toString(),
      mintAuthority: kzt.mintAuthority?.toBase58() ?? null,
      freezeAuthority: kzt.freezeAuthority?.toBase58() ?? null,
      tlvLength: kzt.tlvData.length,
    },
    wallets: {
      steppe: await sys(STEPPE),
      grain: await sys(GRAIN),
    },
    derived,
    recorded: {
      steppeWheat: placement.investorInstrumentAta,
      steppeKzt: placement.demoKzt.investorAta,
      registrarWheat: placement.registrarInstrumentAta,
    },
    identities: {
      grainWallet: GRAIN,
      grainWheat: grab(identities, "GRAIN_DESK_WHEAT_ATA"),
      grainKzt: grab(identities, "GRAIN_DESK_DEMO_KZT_ATA"),
    },
    atas: {
      steppeWheat: await token(placement.investorInstrumentAta),
      steppeKzt: await token(placement.demoKzt.investorAta),
      grainWheat: await token(derived.grainWheat),
      grainKzt: await token(derived.grainKzt),
      registrarWheat: await token(placement.registrarInstrumentAta),
    },
    secondaryReceiptPda: {
      tradeId: TRADE_ID,
      address: receiptPda.toBase58(),
      account: await sys(receiptPda.toBase58()),
    },
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
