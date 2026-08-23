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

`submitLimitOrder` / `cancelOrder` clone `EngineState` and apply the mutation in one function (no partial writes). Preview uses an in-process mutex. Distributed SQL locking is specified in `supabase/migrations/20260823060000_secondary_market.sql` and is **not applied** to the shared Production Supabase project in this stage.

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

Generic book of holdings with Owned / Available / Reserved / Pledged / Blocked. Registrar remains the legal book of record in the current architecture.

**Unresolved:** disclosed individual holder versus omnibus / nominee custody.

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

## Invariants

- Production SHA on `main` is not modified by this branch.
- No Solana state-changing transaction in Phase 5B Preview.
- No mint, burn, Token-2022 transfer, new primary placement, `agricultural_registry` mutation, or `agricultural_market` programme mutation.
- Legal WHEAT-2027 ownership remains 1,000 minted / Registrar 990 / Steppe Capital 10 / burned 0 until real DvP.
- FILLED / MATCHED / CLEARING_READY / AWAITING_DEVNET_SETTLEMENT do not mean SETTLED.
- Additive SQL in `supabase/migrations/20260823060000_secondary_market.sql` is **not applied** to the shared Production Supabase project in this stage.
- No merge to `main` as part of this phase.
