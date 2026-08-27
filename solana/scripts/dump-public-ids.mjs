import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const placement = JSON.parse(
  readFileSync(join(root, "src/adapters/blockchain/solana/recorded-placement.json"), "utf8"),
);
const token = JSON.parse(
  readFileSync(join(root, "src/adapters/blockchain/solana/recorded-token.json"), "utf8"),
);
const config = readFileSync(join(root, "src/adapters/blockchain/solana/config.ts"), "utf8");
const identities = readFileSync(
  join(root, "src/data/market-core/settlement-identities.ts"),
  "utf8",
);
const wheat = token["tok-wheat-2027"];

function grab(source, marker) {
  const idx = source.indexOf(marker);
  if (idx < 0) {
    return null;
  }
  const slice = source.slice(idx + marker.length);
  const match = slice.match(/"([^"]+)"/);
  return match ? match[1] : null;
}

console.log(
  JSON.stringify(
    {
      investorWallet: placement.investorWallet,
      marketProgramId: placement.marketProgramId,
      instrumentMint: placement.instrumentMint,
      registrarInstrumentAta: placement.registrarInstrumentAta,
      investorInstrumentAta: placement.investorInstrumentAta,
      demoKztMint: placement.demoKzt.mint,
      demoKztInvestorAta: placement.demoKzt.investorAta,
      tokenMint: wheat?.mint ?? null,
      tokenHolder: wheat?.holder ?? null,
      tokenHolderOwner: wheat?.holderOwner ?? null,
      configMarket: grab(config, "MARKET_PROGRAM_ID"),
      configToken2022: grab(config, "TOKEN_2022_PROGRAM_ID"),
      grainWallet: grab(identities, "GRAIN_DESK_SOLANA_WALLET"),
      grainWheat: grab(identities, "GRAIN_DESK_WHEAT_ATA"),
      grainKzt: grab(identities, "GRAIN_DESK_DEMO_KZT_ATA"),
    },
    null,
    2,
  ),
);
