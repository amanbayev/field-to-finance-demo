# Field to Finance

Public demonstration prototype for **digital agricultural finance infrastructure**.

The product shows how rights to future agricultural production can be digitally verified, pooled, risk-adjusted, tokenized and financed:

Field → Digital Agricultural Contract → Verification → Contract Pool → Risk Assessment → Eligible Contract Coverage → Agricultural Token → Primary Placement → Secondary Market → Collateral / Secured Financing → Repayment or Default

This is **not** a production financial product. No real agricultural assets, funds, securities, contractual rights or legal obligations are created or transferred.

Permanent UI badge: `PROTOTYPE · SOLANA DEVNET`

## Current state

**Phase 4 primary placement is complete in Production** (`main`, `https://f2f.amanbayev.pro`).

This branch (`cursor/phase-4-5-auth-rbac-demo-personas`) adds Phase 4.5: users, organisations, roles, server-side authorization and a Demo Persona Switcher. It must **not** mint, burn, transfer, redeploy programs, or change WHEAT-2027 / pool / DAC state.

Do **not** merge to `main` until review.

| Item | Value |
| --- | --- |
| Public demo | https://f2f.amanbayev.pro |
| Production branch | `main` (Phase 4) |
| Feature branch | `cursor/phase-4-5-auth-rbac-demo-personas` |
| Network | Solana Devnet (read-only in the public app) |
| Registry program | `agricultural_registry` |
| Registry Program ID | [`E2jeQaTo7f5m78PkNfQ47srUK3EVexN2ApjEEoBaENjT`](https://explorer.solana.com/address/E2jeQaTo7f5m78PkNfQ47srUK3EVexN2ApjEEoBaENjT?cluster=devnet) |
| Market program | `agricultural_market` |
| Market Program ID | [`9mMsbTZTK2RZW1jSjyDLF6Cs12oECg53mzhsDXeyRXst`](https://explorer.solana.com/address/9mMsbTZTK2RZW1jSjyDLF6Cs12oECg53mzhsDXeyRXst?cluster=devnet) |
| Token-2022 | Mint preserved; ISS-001 supply **1,000** (unchanged by Phase 4) |

What the wheat programme currently proves:

| Metric | Value |
| --- | --- |
| Verified on-chain contracts | 4 (`DAC-2027-0001` … `DAC-2027-0004`) |
| Active pool | 1 (`POOL-WHEAT-2027-01`) |
| Gross contract volume | 10,000 t |
| Eligible coverage / maximum coverage capacity | 8,300 t |
| Coverage haircut | 17% (1,700 bps) |
| Double-use exceptions | 0 |
| Coverage breaches | 0 |
| **Minted supply** | **1,000** (Token-2022 total supply) |
| **Registrar inventory** | **990** |
| **Placed** | **10** (`PL-ISS001-0001`) |
| **Circulating supply** | **10** (held by `INVESTOR-0001`) |
| **Burned** | **0** |

Minted is not placed. 1,000 minted does not mean 1,000 sold.

Catalog still contains 12 off-chain demo contracts. Only the four wheat contracts above are registered on Devnet. Financing modules remain placeholders. Compliance checks remain Demo Provider (simulated) except cryptographic wallet-ownership verification for `INVESTOR-0001`.

Phase 1 contract `DAC-2027-0001` is unchanged: same Program ID, same PDA, same 288-byte account layout. The Registry Program ID was not modified for Phase 4.

## Proven on Solana Devnet

PDA seeds: `["digital_ag_contract", contract_id]` · `["contract_pool", pool_id]` · `["contract_allocation", contract_id, pool_id]` · `["allocation_index", contract_id]`

`DAC-2027-0001`:

| Item | Value |
| --- | --- |
| PDA | [`mbbSSan56m8GZ7Qd5W9qEs8ov5c3R7qH1TAvSgY2K1T`](https://explorer.solana.com/address/mbbSSan56m8GZ7Qd5W9qEs8ov5c3R7qH1TAvSgY2K1T?cluster=devnet) |
| Create tx | [`3Nwom4n…UFfo`](https://explorer.solana.com/tx/3Nwom4nYQTNtwp8iSzPHEnHxK1F2L7phf6kRBUdGB2h7m1JJxsHuN8ygpQM3cmMZxeKMJQeCkuM3diyWmmigUFfo?cluster=devnet) |
| Verify tx | [`bMy4TH3…vDy5`](https://explorer.solana.com/tx/bMy4TH3uosXjBR2CpchADUQiiCpkkAzUSGVKNJhjwF88d5UHnFiAUDsc6ENJPaSypqAemWwxDk8nGCDpZVfvDy5?cluster=devnet) |
| On-chain status | Verified |
| Producer reference | `PRODUCER-0001` (not the legal name) |

Pool `POOL-WHEAT-2027-01`:

| Item | Value |
| --- | --- |
| Pool PDA | [`8A1KhRzo6PciKQ3FVNZ2W52F5hhCw8nkTcZHiZydE89E`](https://explorer.solana.com/address/8A1KhRzo6PciKQ3FVNZ2W52F5hhCw8nkTcZHiZydE89E?cluster=devnet) |
| Gross / eligible | 10,000 t / 8,300 t |
| Haircut | 1,700 bps (17%) |
| Snapshot hash | `4b93b012e8c95c8133aa73faa4720db3b61f4ef83d7750a7b05d4a97417388b2` |
| Double-use control | Protected on-chain |

Token-2022 `WHEAT-2027` (`tok-wheat-2027`):

| Item | Value |
| --- | --- |
| Mint | [`D6Zy1doAzHJmQie7S5tUhJWFVZSY5CtJxYYWGJsV6QuF`](https://explorer.solana.com/address/D6Zy1doAzHJmQie7S5tUhJWFVZSY5CtJxYYWGJsV6QuF?cluster=devnet) |
| Program | Token-2022 (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`) |
| Decimals | 0 (1 token = 1 tonne) |
| Supply | 1,000 (ISS-001) |
| Create tx | [`34HWbTM…UWYF`](https://explorer.solana.com/tx/34HWbTMjgPAKusyx1Vhogp48wwEXVUMwniSBoGFCuG6UQ8jYhVmckuFz9UVsC4A5p67epMQp2zaMxNmQTZz1UWYF?cluster=devnet) |
| Mint to tx | [`xDXzCoi…Ypnr`](https://explorer.solana.com/tx/xDXzCoineDonY63yL5VFMQdaka4jp5m6DPJBeVdVCVXTDD6JTAXvbwdEJGRtmzhL3R8Xnq57F7THDgMfPsQYpnr?cluster=devnet) |
| Holding account | [`321J7bc83M7D3E128tZkiGieg4MaQD5oBpHzHLFSjhQQ`](https://explorer.solana.com/address/321J7bc83M7D3E128tZkiGieg4MaQD5oBpHzHLFSjhQQ?cluster=devnet) |
| Registrar inventory after Phase 4 | 990 |

Mint and freeze authority stay on the deployer key used by WSL scripts. The public app does not mint.

### Phase 4 — primary placement

Phase 4 takes **part of the existing 1,000 minted tokens** from the Registrar holding account and completes **one controlled primary placement**. It does not mint additional WHEAT-2027.

| Term | Meaning | Current value |
| --- | --- | --- |
| Maximum coverage capacity | Eligible contract coverage | 8,300 t |
| Minted supply | Actual Token-2022 total supply | 1,000 |
| Registrar inventory | Minted tokens still held by the Registrar | 990 |
| Placed | Tokens transferred through completed primary placements | 10 |
| Circulating supply | Tokens held outside Registrar inventory after placement | 10 |
| Burned | Redeemed / destroyed tokens | 0 |

Do not use the single word **Issued** when it could mean minted or placed.

WHEAT-2027 remains a **Commodity Agricultural Token**: a claim against the Issuer, not direct legal ownership of a farmer’s wheat, not a claim on an individual Producer, not farm equity, and not ownership of the underlying DAC.

#### Primary placement `PL-ISS001-0001`

| Item | Value |
| --- | --- |
| Investor | `INVESTOR-0001` (development-only; no personal identity on-chain) |
| Investor wallet | [`AJ7wc…Zt63`](https://explorer.solana.com/address/AJ7wcKJq368STkEWFDESGJKBSGvFbHDv749g9iAHZt63?cluster=devnet) |
| Quantity | 10 WHEAT-2027 |
| Investor WHEAT ATA | [`D7dNbub9wmETEkDoS7b73KpVxTwRb26Cbe9ffRptVUDw`](https://explorer.solana.com/address/D7dNbub9wmETEkDoS7b73KpVxTwRb26Cbe9ffRptVUDw?cluster=devnet) |
| Market Program ID | [`9mMsbTZTK2RZW1jSjyDLF6Cs12oECg53mzhsDXeyRXst`](https://explorer.solana.com/address/9mMsbTZTK2RZW1jSjyDLF6Cs12oECg53mzhsDXeyRXst?cluster=devnet) |
| Placement PDA | [`rr7Nqi9qk1VgLpZKBb7mj3Y4hEj3oK9y8n5ecRbgy5T`](https://explorer.solana.com/address/rr7Nqi9qk1VgLpZKBb7mj3Y4hEj3oK9y8n5ecRbgy5T?cluster=devnet) |
| Atomic DvP tx | [`24ALzig…W7Ap`](https://explorer.solana.com/tx/24ALzig86DnGZQ2AE5UmFJ9PS8nkuFu92QJs8fpnw1bBh7LFJhY3jidRF5nZJM4xPkfFKK8xWZ8R8LCtVuXUW7Ap?cluster=devnet) |
| Simulated unit price | 100,000 DEMO-KZT · **Simulation Only · Not Commercial Terms** |
| Settlement amount | 1,000,000 DEMO-KZT |

Atomic **Delivery-versus-Payment** runs in **one** Solana instruction: investor DEMO-KZT and Registrar WHEAT-2027 move together, and a `PrimaryPlacementReceipt` PDA is created. If either leg fails, the whole transaction fails.

The public application is **read-only**. Registrar, investor and settlement mint authorities stay in WSL `~/.config/solana/` and are never committed or bundled to Vercel.

#### DEMO-KZT

`DEMO-KZT` is a **DEVNET-ONLY settlement asset** used to demonstrate atomic DvP mechanics.

- DEMO SETTLEMENT ASSET
- **NO MONETARY VALUE**
- not a stablecoin
- not tokenized KZT
- not legal tender
- not a claim against a bank

Minting DEMO-KZT to the development investor is demo infrastructure. It is not capital raised and is not WHEAT-2027 issuance.

| Item | Value |
| --- | --- |
| DEMO-KZT mint | [`CsBynEU4zZnKyJjCspE9RxNo2VnLBJZV3nmeJSVT7CcA`](https://explorer.solana.com/address/CsBynEU4zZnKyJjCspE9RxNo2VnLBJZV3nmeJSVT7CcA?cluster=devnet) |
| Settlement destination | `ISSUER-SETTLEMENT-001` — **Technical Demo Settlement Account** (commercial beneficiary unresolved) |

#### Compliance, wallet ownership, privacy

- Investor eligibility uses the existing Compliance Gateway abstraction. Provider results are labelled **DEMO / SIMULATED** unless a check is a real sandbox connection.
- Wallet ownership for `INVESTOR-0001` is a real Ed25519 signature over a nonce. The public UI shows **Verified** plus a shortened Solana address. Private keys are not stored.
- Public pages show `INVESTOR-0001` and a shortened wallet only. No legal name, IIN, BIN, email, phone or KYC documents.

#### Architecture

`agricultural_registry` remains contracts / pools / coverage. `agricultural_market` handles placement / settlement / ownership transfer. SCAS still does not mint, burn, execute placement, hold investor funds or transfer WHEAT-2027.

Recorded public proof: `src/adapters/blockchain/solana/recorded-placement.json`. Simulated price manifest: `src/adapters/blockchain/solana/placement-manifest.json`.

Phase 4 is a **technical** primary placement demonstrator. Commercial terms, investor eligibility rules, the actual settlement asset and production market structure remain subject to partner / legal / regulatory decisions.

Additional verified contracts: `DAC-2027-0002` (`PRODUCER-0002`), `DAC-2027-0003` (`PRODUCER-0003`), `DAC-2027-0004` (`PRODUCER-0004`). Public signatures live in `src/adapters/blockchain/solana/recorded-proof.ts`. Mint proof lives in `src/adapters/blockchain/solana/recorded-token.json`.

On-chain proof is **not** the full business record. The chain stores a producer reference, crop, season, area, volume, quality class and region. It does **not** store legal names, BIN/IIN, KYC documents or financials.

Coverage math is off-chain (`src/domain/coverage-engine.ts`, integer basis points, floor). The chain stores the snapshot hash, not the risk model.

The public app **does not sign transactions**. Admin create/verify/allocate runs from WSL scripts. Signing keypairs never appear in `NEXT_PUBLIC_*`.

## Solana workspace

Anchor work lives in `solana/` and is compiled in **WSL Ubuntu**, not native Windows.

```
solana/
  Anchor.toml
  programs/agricultural_registry/
  programs/agricultural_market/
  scripts/register-demo.mjs
  scripts/phase2-devnet.mjs
  scripts/phase3-token-mint.mjs
  scripts/phase3-mint-tranche.mjs
  scripts/phase4-deploy-market.sh
  scripts/phase4-primary-placement.mjs
```

### WSL toolchain (inspected)

- Ubuntu 26.04 on WSL2
- rustc 1.89.0 (workspace `rust-toolchain.toml`) / host rustc 1.98.0
- solana-cli 3.1.10
- avm 1.1.2
- anchor-cli 1.1.2

Source of truth is this Git repository. Anchor `build`/`test`/`deploy` run from a Linux-native copy at `~/src/field-to-finance-demo/solana` because `/mnt/c` is slow for Rust.

Do **not** recreate the Devnet contracts or pool, change the Program ID, or upgrade the program unless a real bug requires it.

```bash
# WSL — tests only. Do not re-run Devnet setup against the live demo accounts.
cd ~/src/field-to-finance-demo/solana
anchor test
```

Development wallets stay in `~/.config/solana/` and are never committed. Fund them with Devnet SOL only.

Explorer links always use `cluster=devnet`.

## Languages

| Code | Language | Switcher |
| --- | --- | --- |
| `kk` | Kazakh | ҚАЗ |
| `ru` | Russian | РУС |
| `en` | English | ENG |

Default locale: **Kazakh (`kk`)**. Missing keys fall back to English. The selected language is stored in the `ftf-locale` cookie. Routes such as `/contracts` have no locale prefix.

```
messages/en.json  ru.json  kk.json
src/i18n/config.ts  request.ts  actions.ts  merge-messages.ts
```

UI copy lives in the catalogs. Domain enums (`VERIFIED`, `IN_POOL`, …) are unchanged; only presentation is translated.

## Currency formatting

Kazakhstan tenge is the primary display currency. USD is a secondary reference only.

- `BASE_CURRENCY=KZT`
- `REFERENCE_CURRENCY=USD`
- `DEMO_USD_KZT_RATE=500` (1 USD = 500 KZT) — fixed demonstration reference, not a live quote

Defined in `src/adapters/fx/config.ts` and consumed through `FxProvider`. Example: ₸620,000,000 ≈ $1.24M.

## Tech stack

- Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4, shadcn/ui, next-intl, npm
- `@solana/web3.js` (server-side Devnet reads)
- Anchor 1.1.2 + Solana CLI 3.1.10 (WSL)

Inspected local toolchain at scaffold:

- Node.js `v24.19.0`
- npm `11.17.0`
- Git `2.54.0.windows.1`
- Vercel CLI via `npx vercel`

## Architecture

Product domain logic does not talk to a chain SDK or a KYC vendor directly. UI pages call services. Services read mock data and, where Phase 1/2 proof exists, the Solana adapter.

```
src/
  app/                 UI routes
  components/          Layout and product UI
  domain/              Typed business models + coverage engine
  data/mock/           Replaceable demonstration data
  services/            Product use-cases
  adapters/
    blockchain/        BlockchainProvider, mock + Solana
    compliance/        KycProvider, KybProvider, KytProvider + mocks
    scas/              ScasProvider + mock operator attestations
    fx/                FxProvider + DemoFxProvider
  i18n/
  lib/                 Formatting, navigation, public env defaults
```

### Blockchain adapter

`BlockchainProvider` is read-oriented in the public app: network status, contract/pool/allocation lookups, coverage proof, and a no-op `issueToken()`. Create/verify remain available on the interface for admin scripts, not for Vercel.

Environment policy:

| Environment | `NEXT_PUBLIC_BLOCKCHAIN_PROVIDER` |
| --- | --- |
| Development (local default) | `mock` |
| Preview (Vercel) | `solana` / Devnet |
| Production (Vercel) | `solana` / Devnet |

Local live reads: set `NEXT_PUBLIC_BLOCKCHAIN_PROVIDER=solana` in `.env.local`. Do not change Production RPC or Program ID casually.

If public Devnet RPC is rate-limited, pages still render the off-chain business record. The proof panel shows a temporary unavailability state. It never invents live proof.

### Compliance adapters

Phase 0 mock providers labelled **Demo Compliance Provider**. Sumsub, TRM or another vendor can implement `KycProvider` / `KybProvider` / `KytProvider` later. No vendor is integrated.

## Routes

| Path | Module | Production meaning |
| --- | --- | --- |
| `/` | Dashboard | Coverage remains primary; secondary minted / placed / inventory |
| `/contracts` | Digital Agricultural Contracts | 4 verified on-chain; 8 remaining catalog rows |
| `/contracts/[contractId]` | Contract detail | Live proof for DAC-2027-0001…0004 |
| `/pools` | Contract pools | |
| `/pools/[poolId]` | Pool, coverage, double-use, pool proof | Live for `POOL-WHEAT-2027-01` |
| `/tokens` | Agricultural token series | Supply decomposition; mint/burn/placement disabled |
| `/market` | Primary placement demonstrator | Simulated price; DEMO-KZT has no monetary value |
| `/market/PL-ISS001-0001` | Placement detail | Read-only DvP evidence |
| `/finance` | Secured loan and repo placeholders | Coming next / experimental |
| `/compliance` | Compliance control center | Demo Provider (simulated) |
| `/scas` | SCAS operator | Attests fields, monitoring, pool lock, coverage. Does not mint or place |
| `/regulator` | Regulator view and audit trail | Coverage + token supply + placement proof |

## How to run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run lint
npm run typecheck
npm run build
npm run start
```

## Roadmap

This is the **executed engineering numbering**. Phase 0 of the original brief listed a different map (see below). Product intent did not change.

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Public UI prototype | Complete |
| 0.1 | ҚАЗ / РУС / ENG + KZT-primary money | Complete |
| 0.2 | Public Vercel deployment | Complete |
| 0.3 | Institutional UI refinement | Complete |
| 1 | Solana Devnet + Digital Agricultural Contract registry | Complete in Production |
| 2 | Contract pool, off-chain coverage engine, on-chain snapshot hash, double-use protection | Complete in Production |
| 3 | Token-2022 issuance | Complete: ISS-001 minted 1,000; mint preserved |
| 4 | Primary placement / atomic DvP | Complete on Devnet (this branch). Preview only. Do not merge to `main` until review |
| 5 | Secondary market | Not started |
| 6 | Secured financing | Not started (UI placeholder) |
| 7 | Risk monitoring, coverage events, default / enforcement | Not started (risk sources are DEMO / SIMULATED) |

Parallel tracks, not a numbered gate before Phase 3:

- Compliance gateway (still mock)
- Production blockchain / registrar architecture (Solana Devnet is a technology demonstrator, not a production choice)

## Plan revision (original brief vs now)

The 20 Aug 2026 Phase 0 brief is still the product plan. What changed is **phasing and honesty of mock state**, not the lifecycle.

| Original brief | What we did | Unchanged? |
| --- | --- | --- |
| Live public demo from day one | Yes (`https://f2f.amanbayev.pro`) | Yes |
| Institutional UI, not crypto-casino | Yes (Phase 0.3) | Yes |
| Adapter split: domain / services / blockchain / compliance | Yes; Solana provider added | Yes |
| Phase 1 = “Solana connection”, Phase 2 = “DAC registry” | Combined into **Phase 1** | Numbering only |
| Phase 3 = pools + coverage | Built as **Phase 2** | Numbering only |
| Phase 4 = Token-2022 | Built as **Phase 3**. Current **Phase 4** is primary placement / atomic DvP | Numbering only |
| Dashboard mock: 8,000 t already tokenized, 122% coverage ratio | Corrected: eligible **8,300 t**; minted **1,000**; placed **10** | Demo honesty; pool math unchanged |
| Tokens page mock: Issued 8,000 | Corrected: minted 1,000 (ISS-001); placed 10; cap 8,300 t | Same |
| Coverage engine “on-chain” as a later phase | Hybrid: off-chain integer math, hash anchored on-chain | Stronger than the original split |
| Double-use protection | Added in Phase 2 on-chain (not in the Phase 0 list) | Additive |
| Localization, KZT, custom domain | Inserted as 0.1 / 0.2 before Solana | Additive |
| Public app signs chain txs | Never; writes stay in scripts | Safer than implied |
| Replace Solana later via adapter | Still the rule. Devnet is a demonstrator. | Yes |
| KYC/KYB/KYT mocks until a vendor | Still mock | Yes |
| Finance / repo placeholders | Still placeholders | Yes |

Original Phase 0 dashboard numbers (12 catalog contracts, 24,800 t catalog volume, ₸620M / $1.24M illustrative financing) remain as **catalog / placeholder** figures. They are not on-chain pool state.

## Public demo

| Item | Value |
| --- | --- |
| Custom domain | https://f2f.amanbayev.pro |
| Vercel production | https://field-to-finance-demo.vercel.app |
| Platform | Vercel |
| GitHub | https://github.com/amanbayev/field-to-finance-demo |

Keep deploying later phases to the same production hostname.

### Deployment

Preview: `npx vercel`  
Production: push `main` (GitHub → Vercel) or `npx vercel --prod`

Do not place Vercel tokens, GitHub credentials, wallet files, or API secrets in this repository.

### Environment configuration

Copy `.env.example` to `.env.local` for local overrides:

```bash
NEXT_PUBLIC_APP_ENV=demo
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_BLOCKCHAIN_PROVIDER=mock
NEXT_PUBLIC_SOLANA_REGISTRY_PROGRAM_ID=E2jeQaTo7f5m78PkNfQ47srUK3EVexN2ApjEEoBaENjT
```

Vercel Preview and Production keep `NEXT_PUBLIC_BLOCKCHAIN_PROVIDER=solana`. Local default is `mock`.

Defaults live in `src/lib/public-env.ts`.

Do not put private keys, seed phrases, wallet JSON, or secret API credentials in `NEXT_PUBLIC_*` variables.

### Phase 4.5 — authentication (this branch)

The app uses **Supabase Auth + Postgres** for persistent users, organisations, memberships and RLS. There is **no dedicated Field to Finance Supabase project in this repository yet**. Do not reuse unrelated projects (`personal-os` or similarly named accounts).

Required Preview/local values (publishable only in `NEXT_PUBLIC_*`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_SITE_URL=
```

Optional server-only: `SUPABASE_SERVICE_ROLE_KEY` (never `NEXT_PUBLIC_*`).

Apply `supabase/migrations/20260822120000_identity.sql` then `supabase/seed.sql`. After the presenter signs up, bootstrap once:

```sql
select public.grant_system_admin_if_none('presenter@example.com');
```

That function fails if a SYSTEM_ADMIN already exists. Demo persona switching is server-validated (`assume_demo_persona` RPC) and writes `DEMO_CONTEXT` audit events. It is not on-chain.
