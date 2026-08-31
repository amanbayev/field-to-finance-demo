# Market Core architecture — Phase 5B Preview

Legal operator: **CommoChain Ltd**. Field to Finance is the **Agriculture Asset Protocol**, not the universal platform/product name. The platform brand is temporary / unassigned (`Investment Token Platform`). This document records what is implemented, what is an architecture foundation, and what is future. It does not claim AFSA permission.

Architecture:

CommoChain Ltd → operates Platform → Platform contains Market Core → Market Core supports Asset Protocols → Field to Finance is one Asset Protocol.

Phase 5B Preview adds a generic secondary LIMIT matching engine. It **does not** execute Devnet DvP, mint, burn, or Token-2022 transfers. Legal WHEAT-2027 ownership remains 1,000 / Registrar 990 / Steppe Capital 10 / burned 0.

## Layers (never mix)

1. **Platform / Market Core** — markets, issuances, clearing, registry, participants, compliance, supervision, audit.
2. **Asset protocol** — Field to Finance (Agriculture, active demonstrator); Water and Music Rights (structuring); Gaming Assets (concept).
3. **Investment instrument** — WHEAT-2027 (`ASSET_TOKEN`, issued demonstrator). Field to Finance Protocol Investment is `PROTOCOL_INVESTMENT`, CONCEPT / STRUCTURING, no offering, not issued, not admitted.

ISS-001 is an issuance of WHEAT-2027, not a token type. POOL-WHEAT-2027-01 is backing infrastructure, not a market. DAC / pool / coverage are Field to Finance modules, not global platform concepts.

## Market Core

| Topic | Status |
| --- | --- |
| Generic Instrument, Market, Order, Trade, Settlement, Holding, eligibility matrix | **IMPLEMENTED**. |
| WHEAT-2027 as first instance of those types | **IMPLEMENTED**. Live supply proof remains 1,000 minted / Registrar 990 / Steppe Capital 10. |
| Immutable `ProtocolVersion` and `Instrument → ProtocolVersion` binding (Phase 5C.1) | **IMPLEMENTED**. `ProtocolVersion` owns the versioned rule snapshot; `AssetProtocol` no longer carries a mutable copy. WHEAT-2027 binds permanently to `F2F-V1.1` (display version `1.1`). `AssetProtocol.currentVersionId` is a discovery pointer and is never used to resolve an issued instrument. `F2F-V1.1` is the first recorded version of the **demonstrator** protocol: `activatedAt` and `frozenAt` are `null` because **no formal legal or governance activation date is claimed**. Immutability is asserted by the `frozen` marker, not by a date. Water / Music Rights / Gaming Assets and the F2F Protocol Investment have **no** version. Version data and validation helpers only — a protocol rules engine and supersession workflow are Phase 8. See `docs/PHASE_5C_PLAN.md`. |
| WheatOrder / WheatTrade / WheatMarket types | **Not created** (forbidden). |
| Secondary matching / transacting market | **IMPLEMENTED (Preview)**. Market `MKT-WHEAT-2027-DEMO-KZT`, `phase: SECONDARY_OPEN`, `transacting: true`, LIMIT only. Stops at `AWAITING_DEVNET_SETTLEMENT`. |

## Matching

Deterministic price-time priority. Operators cannot choose counterparties.

- BUY: highest price, then earliest sequence
- SELL: lowest price, then earliest sequence
- Cross when `bestBuy.price >= bestSell.price`
- **Execution price is the limit price of the RESTING order** (already on the book). The incoming order is the aggressor.

Partial fills are supported. WHEAT quantities are whole integers (`decimals = 0`).

FILLED ≠ SETTLED. MATCHED ≠ registry update.

## Reservations

`available = owned − reservedForOrders − pledged − blocked`.

Placing a SELL does not transfer legal ownership. Filled quantity stays reserved until settlement completes (not in this Preview). Cancellation releases only remaining unfilled quantity.

BUY reserves `limit × quantity` DEMO-KZT via `DemoSettlementProvider`. DEMO-KZT has no monetary value. `settle()` throws; Devnet settlement is not enabled.

## Concurrency

`submitLimitOrder` / `cancelOrder` clone `EngineState` and apply the mutation in one function (no partial writes). Unit tests may still use the in-process store. **Preview and runtime authority is PostgreSQL**: `pg_advisory_xact_lock(hashtext(market_id))` plus `SELECT … FOR UPDATE` inside `market_core_*` SECURITY DEFINER RPCs. Node mutex is not used for correctness. Applied only to the dedicated field-to-finance Supabase project.

Idempotency: `market_core_idempotency` unique `(scope, key)` for `submit`, `cancel`, `match`, and `settlement_submit`. A repeated submit with the same key returns the stored result and does not insert a second order. Matching is not a client-chosen counterparty; `market_core_match_incoming` selects resting orders by price-time under the market lock.

Tables have RLS enabled and **no client policies**. `authenticated` is revoked from table DML. Reads and writes go through SECURITY DEFINER RPCs that check `auth.uid()`, map the session persona / membership to a participant, and reject registrar / regulator / admin trading. `service_role` is not used in the browser bundle.

## Asset protocols

| Protocol | Status | Verification |
| --- | --- | --- |
| Field to Finance | **ACTIVE** demonstrator | SCAS / fields / DAC / coverage |
| Water | **STRUCTURING** | Structuring — not an admitted instrument |
| Music Rights | **STRUCTURING** | Structuring — not an admitted instrument |
| Gaming Assets | **CONCEPT** | Concept — not an admitted instrument |

No fake admitted Water / Music / Gaming tokens exist.

## Instrument families

- **ASSET_TOKEN** — claim against the issuer, backed by a protocol-specific economic basis. WHEAT-2027 is the only issued instance.
- **PROTOCOL_INVESTMENT** — investment in the protocol / vehicle itself. Different rights and risks. Field to Finance Protocol Investment is **CONCEPT / STRUCTURING**. No offering, not issued, not admitted. No offer, price, yield, term, or chain state.

An investment in an asset and an investment in the protocol itself are different instruments.

## Admission workflow

Platform stages from idea through secondary market admission are recorded for WHEAT-2027. **Devnet DvP for secondary trades is not complete.** This is platform governance language, not a claim that AFSA requires these steps in this form. Formal regulatory permission is separate and is **not claimed**.

## Eligibility

Eligibility is **participant × instrument**, not a single ELIGIBLE flag.

Current matrix:

- Steppe Capital × WHEAT-2027 → ELIGIBLE (`canReceive` true, `canTrade` true on the DEMO LIMIT market)
- Grain Desk × WHEAT-2027 → ELIGIBLE
- Commodity Desk × WHEAT-2027 → NOT_ASSESSED
- Steppe Capital × future water instrument → NOT_ASSESSED
- Steppe Capital × protocol investment → NOT_ASSESSED (`canTrade` always false)
- Retail placeholder × WHEAT-2027 → POLICY_PENDING

Holdings: `available = owned − reserved − pledged − blocked`. Legal owned amounts do not change on match. Pending in/out are working fields only.

## Clearing vs market

- **Market** records who traded with whom at what price: Order → Matching → Trade.
- **Clearing** records whether obligations were fulfilled and settlement became final: Trade → Eligibility recheck → Reservations → DvP → Registry update → Finality.

PL-ISS001-0001 is **primary placement evidence**, not a secondary clearing event. The first secondary trade is seeded to `AWAITING_DEVNET_SETTLEMENT` with DvP / registry / finality **PENDING**.

## Registry

Generic book of holdings with Owned / Available / Reserved / Pledged / Blocked.

**Authoritative registered ownership** is `public.registrar_registered_ownership` (Registrar book of record). Legal `owned` is written only by registrar evidence (primary placement or completed secondary settlement). Matching must not write this table.

**`market_core_holdings`** is the market balance view / trading projection around that book: `owned` is a denormalized copy; matching may update `reserved_for_orders`, `pledged`, `blocked`, `pending_in`, `pending_out` only. A trigger rejects `owned` mutations unless `app.registrar_sync = on`.

**`market_core_chain_proof`** is observed / cached proof (`source`, `observed_at`, `slot`, `signature`, `ata`). It is not chain truth. Settlement approval requires `LIVE_RPC` against Solana Devnet.

Unresolved: disclosed individual holder versus omnibus / nominee custody.

## Distribution channels

All channels must route into the **same Market Core**.

| Channel | Status |
| --- | --- |
| DIRECT_MTP / institutional portal | **ACTIVE** |
| Retail app | **FUTURE** |
| API / brokers | **FUTURE** |

Binance is a **future custody / gateway adapter**, not the trading engine. No Binance SDK, credentials, or environment variables are configured. A future retail frontend, if built, is a distribution channel — not a second order book.

Settlement adapters (`BankSettlementProvider`, `StablecoinSettlementProvider`) are interfaces only (`implemented: false`).

## SPV / issuer stack

Configurable structuring model, not a legal requirement for every future protocol:

Asset Protocol → SPV / Issuer → Investment Instrument → Market Core

## UX inventory (Phase 5B)

### A. Platform-level screens

- `/markets` — discovery
- `/architecture` — distribution diagram
- `/instruments` — two families
- `/issuances`, `/issuances/ISS-001`
- `/secondary` — LIMIT order book, order entry, my orders, recent trades, clearing strip
- `/clearing` — primary placement evidence kept separate from secondary trades
- `/registry` (`/ownership` redirects here) — legal owned plus working reserved / pending columns
- `/participants` — includes participant × instrument matrix
- `/compliance` and sub-routes
- `/supervision` — market `MKT-WHEAT-2027-DEMO-KZT`, 1 matched trade, 1 settlement pending
- `/audit` — application events, secondary market events, chain evidence

### B. Protocol-level screens

- `/protocols/F2F` — agriculture world, lifecycle, F2F-only modules
- `/protocols/WATER`, `/protocols/MUSIC_RIGHTS`, `/protocols/GAMING_ASSETS` — structuring / concept only

### C. Instrument-level screens

- `/instruments/WHEAT-2027` — universal sections; agriculture basis is adapter-specific
- `/instruments/F2F-PROTOCOL-INVESTMENT` — CONCEPT / STRUCTURING · no offering · not issued · not admitted
- `/tokens/WHEAT-2027` redirects to the instrument page

### D. Role workspaces

- Producer, SCAS, Issuer — Field to Finance operational (unchanged except issuer instrument href)
- Investor / Trader — Markets + instruments + secondary LIMIT market (`market.trade`)
- Registrar — backing, tokens, issuances, placements, registry, clearing, audit (no discretionary matching)
- Regulator — read-only surveillance
- Compliance officer — screening workspace
- Admin — system workspace; unimpersonated admin has no participant id and cannot submit orders
- Matching Engine — system logic, non-discretionary

### E. Screens inherited from Phase 4.5

Agriculture operational screens remain: fields, contracts, pools, coverage, backing, SCAS, monitoring, finance, documents, tokens registry, placements, market/placement proof, `/regulator` (legacy F2F proof, not in nav).

### F. Screens refactored

Instruments list, secondary market (now a transacting Preview demonstrator), ownership → registry, participants eligibility matrix, issuer WHEAT href, regulator / investor / trader overviews, issuances accessible to regulator.

### G. New screens

Markets, protocol detail, instrument detail (universal layout), clearing, registry, supervision, architecture. Phase 5B upgrades `/secondary` and `/clearing`.

### H. Future-only screens / channels

Retail app, broker/API portals, Binance custody UI, bank/stablecoin settlement UI, live protocol-investment offer, Devnet secondary DvP.

### I. Navigation hierarchy (target)

Regulator: Overview / Markets / Instruments / Issuances / Clearing / Registry / Participants / Compliance / Supervision / Reports.

Investor: Overview / Markets / Instruments / Portfolio / My placements / Secondary market / My compliance.

Registrar: Overview / Markets / Backing / Tokens / Issuances / Placements / Registry / Clearing / Audit.

Agriculture modules stay on `/protocols/F2F`, not in global regulator nav.

## Agriculture-specific vs generic Market Core

**Remain agriculture-specific:** fields, DACs/contracts, SCAS, pools, coverage/backing, producer finance, F2F lifecycle on the protocol page, WHEAT economic-basis adapter (DAC / pool / coverage / SCAS / insurance / monitoring).

**Generic Market Core:** markets discovery, instrument shell, admission stages, eligibility matrix, holdings buckets, matching engine, reservations, clearing vs market flows, registry filters, supervision exceptions, distribution channels, protocol/instrument/issuance breadcrumbs.

Matching, reservation, settlement-provider, order-book and engine modules must not import SCAS / coverage / wheat-specific market types.

## Environment split (Phase 5B.1)

- **Production application** (Vercel Production / `main`) remains **Phase 5A**. It is not updated by this branch. Phase 5A operational routes (`/fields`, `/contracts`, `/tokens`, `/placements`, `/pools`, `/coverage`, `/scas`, `/finance`, `/documents`, `/monitoring`) do not read `market_core_*` or `registrar_registered_ownership`.
- **Dedicated field-to-finance Supabase database** (`qnzoghmqnqwfpkzgpede`) has already been extended with additive Phase 5B.1 market schema and RPCs. That is database state, not a Production application deploy.
- Preview application on this branch reads the dedicated database. Production application code on `main` does not expose the new secondary-market book.

## Repository ↔ remote migrations

Alignment is by **name / content**, not identical timestamps. Do not rewrite already-applied remotes.

| Repo file | Remote version / name |
| --- | --- |
| `20260822120000_identity.sql` | `20260822181823_identity` |
| `20260822231500_identity_security_hardening.sql` | `20260822182016_identity_security_hardening` |
| `20260822233000_identity_admin_capabilities.sql` | `20260822183954_identity_admin_capabilities` |
| `20260823060000_secondary_market.sql` | `20260823085648_secondary_market` |
| *(no useful SQL — do not rewrite)* | `20260823091615_market_core_rpc` (accidental `select 1`) |
| `20260823120000_market_core_rpc.sql` (helpers + match + submit/cancel + read, combined in repo) | `20260823091641_market_core_rpc_helpers`, `20260823091724_market_core_rpc_match`, `20260823091853_market_core_rpc_submit_cancel`, `20260823091854_market_core_rpc_read` |
| *(accidental `select 1` during approval — do not rewrite)* | `20260823142920_registrar_book_and_live_proof` |
| `20260823200000_registrar_book_and_live_proof.sql` (tables / triggers / identities) | `20260823143018_registrar_book_tables` |
| same file (snapshot + reconcile) | `20260823143635_registrar_book_rpcs` |
| same file (isolated sell fixture; buy/cleanup RPCs not applied remotely) | `20260823143714_registrar_book_isolated_tests` |
| same file (revoke isolated execute + search_path) | `20260823150623_revoke_isolated_test_rpcs` |

## Secondary DvP

`agricultural_market` currently exposes only `initialize_market` and `settle_primary_placement`. Primary DvP takes WHEAT from the Registrar ATA and DEMO-KZT from the primary investor, paying the issuer settlement owner. It cannot atomically move WHEAT seller→buyer and DEMO-KZT buyer→seller. A new `settle_secondary_dvp` instruction and programme redeploy are required. No deploy is performed in 5B.1.

Grain Desk (`GRAIN-DESK` / `DEMO-TRADER-001`) has **no** mapped Solana wallet and **no** WHEAT / DEMO-KZT ATA. Those accounts must not be fabricated. Creating them is a state-changing 5B.2 preparation step.

## Invariants

- Production SHA on `main` is not modified by this branch.
- No Solana state-changing transaction in Phase 5B Preview.
- No mint, burn, Token-2022 transfer, new primary placement, `agricultural_registry` mutation, or `agricultural_market` programme mutation.
- Legal WHEAT-2027 ownership remains 1,000 minted / Registrar 990 / Steppe Capital 10 / burned 0 until real DvP.
- FILLED / MATCHED / CLEARING_READY / AWAITING_DEVNET_SETTLEMENT do not mean SETTLED.
- Additive SQL is applied only to the dedicated field-to-finance Supabase project, not by rewriting Production application code.
- No merge to `main` as part of this phase.
