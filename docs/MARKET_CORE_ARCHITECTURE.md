# Market Core architecture — Phase 5A

Legal operator: **CommoChain Ltd**. Field to Finance is the **Agriculture Asset Protocol**, not the universal platform/product name. The platform brand is temporary / unassigned (`Investment Token Platform`). This document records what is implemented, what is an architecture foundation, and what is future. It does not claim AFSA permission.

Architecture:

CommoChain Ltd → operates Platform → Platform contains Market Core → Market Core supports Asset Protocols → Field to Finance is one Asset Protocol.

## Layers (never mix)

1. **Platform / Market Core** — markets, issuances, clearing, registry, participants, compliance, supervision, audit.
2. **Asset protocol** — Field to Finance (Agriculture, active demonstrator); Water and Music Rights (structuring); Gaming Assets (concept).
3. **Investment instrument** — WHEAT-2027 (`ASSET_TOKEN`, issued demonstrator). Field to Finance Protocol Investment is `PROTOCOL_INVESTMENT`, CONCEPT / STRUCTURING, no offering, not issued, not admitted.

ISS-001 is an issuance of WHEAT-2027, not a token type. POOL-WHEAT-2027-01 is backing infrastructure, not a market. DAC / pool / coverage are Field to Finance modules, not global platform concepts.

## Market Core

| Topic | Status |
| --- | --- |
| Generic Instrument, Market, Order, Trade, Settlement, Holding, eligibility matrix | **IMPLEMENTED** as domain types. Phase 5A creates no orders and no secondary trades. |
| WHEAT-2027 as first instance of those types | **IMPLEMENTED**. Live supply proof remains 1,000 minted / Registrar 990 / Steppe Capital 10. |
| WheatOrder / WheatTrade / WheatMarket types | **Not created** (forbidden). |
| Secondary matching / transacting market | **FUTURE**. `canTrade` is false. `transacting: false`. `phase: PRIMARY_ONLY`. |

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

Platform stages from idea through primary placement are recorded for WHEAT-2027. **Secondary market is not complete.** This is platform governance language, not a claim that AFSA requires these steps in this form. Formal regulatory permission is separate and is **not claimed**.

## Eligibility

Eligibility is **participant × instrument**, not a single ELIGIBLE flag.

Current matrix:

- Steppe Capital × WHEAT-2027 → ELIGIBLE (`canReceive` true, `canTrade` false)
- Steppe Capital × future water instrument → NOT_ASSESSED
- Steppe Capital × protocol investment → NOT_ASSESSED
- Retail placeholder × WHEAT-2027 → POLICY_PENDING

Holdings: `available = owned − reserved − pledged − blocked`. Current reserved / pledged / blocked are 0.

## Clearing vs market

- **Market** records who traded with whom at what price: Order → Matching → Trade.
- **Clearing** records whether obligations were fulfilled and settlement became final: Trade → Eligibility recheck → Reservations → DvP → Registry update → Finality.

PL-ISS001-0001 is **primary placement evidence**, not a secondary clearing event. There is no secondary trade.

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

## UX inventory (Phase 5A)

### A. Platform-level screens

- `/markets` — discovery
- `/architecture` — distribution diagram
- `/instruments` — two families
- `/issuances`, `/issuances/ISS-001`
- `/clearing`
- `/registry` (`/ownership` redirects here)
- `/participants` — includes participant × instrument matrix
- `/compliance` and sub-routes
- `/supervision`
- `/audit` (regulator label: Reports)

### B. Protocol-level screens

- `/protocols/F2F` — agriculture world, lifecycle, F2F-only modules
- `/protocols/WATER`, `/protocols/MUSIC_RIGHTS`, `/protocols/GAMING_ASSETS` — structuring / concept only

### C. Instrument-level screens

- `/instruments/WHEAT-2027` — universal sections; agriculture basis is adapter-specific
- `/instruments/F2F-PROTOCOL-INVESTMENT` — CONCEPT / STRUCTURING · no offering · not issued · not admitted
- `/tokens/WHEAT-2027` redirects to the instrument page

### D. Role workspaces

- Producer, SCAS, Issuer — Field to Finance operational (unchanged except issuer instrument href)
- Investor / Trader — Markets + instruments + closed secondary
- Registrar — backing, tokens, issuances, placements, registry, clearing, audit
- Regulator — platform IA (no global Contracts / Pools / Coverage)
- Compliance officer — screening workspace
- Admin — system workspace

### E. Screens inherited from Phase 4.5

Agriculture operational screens remain: fields, contracts, pools, coverage, backing, SCAS, monitoring, finance, documents, tokens registry, placements, market/placement proof, `/regulator` (legacy F2F proof, not in nav).

### F. Screens refactored

Instruments list, secondary market (still closed), ownership → registry, participants eligibility matrix, issuer WHEAT href, regulator / investor / trader overviews, issuances accessible to regulator.

### G. New screens

Markets, protocol detail, instrument detail (universal layout), clearing, registry, supervision, architecture.

### H. Future-only screens / channels

Retail app, broker/API portals, secondary order book, Binance custody UI, bank/stablecoin settlement UI, live protocol-investment offer.

### I. Navigation hierarchy (target)

Regulator: Overview / Markets / Instruments / Issuances / Clearing / Registry / Participants / Compliance / Supervision / Reports.

Investor: Overview / Markets / Instruments / Portfolio / My placements / Secondary market / My compliance.

Registrar: Overview / Markets / Backing / Tokens / Issuances / Placements / Registry / Clearing / Audit.

Agriculture modules stay on `/protocols/F2F`, not in global regulator nav.

## Agriculture-specific vs generic Market Core

**Remain agriculture-specific:** fields, DACs/contracts, SCAS, pools, coverage/backing, producer finance, F2F lifecycle on the protocol page, WHEAT economic-basis adapter (DAC / pool / coverage / SCAS / insurance / monitoring).

**Generic Market Core:** markets discovery, instrument shell, admission stages, eligibility matrix, holdings buckets, clearing vs market flows, registry filters, supervision exceptions, distribution channels, protocol/instrument/issuance breadcrumbs.

## Invariants

- Production SHA on `main` is not modified by this branch.
- No Solana state-changing transaction in Phase 5A.
- No secondary trading.
- No merge to `main` as part of this phase.
