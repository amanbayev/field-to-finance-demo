# Commodity Chain Protocol Platform — Architecture Canon

**Status:** Strategic product/domain architecture canon.  
**Audience:** Product, engineering, Cursor, Claude Code, Codex and other implementation agents.  
**Legal operator:** CommoChain Ltd.  
**Scope:** Target architecture and domain boundaries. This document does **not** claim that every component is implemented or that any specific regulatory permission has been granted.

For current implementation status, read `docs/MARKET_CORE_ARCHITECTURE.md`.

---

## 1. Core thesis

Commodity Chain is not a grain-specific token application.

It is regulated infrastructure for creating, issuing, trading, clearing, settling and servicing **protocol-based investment instruments backed by real-world assets or rights**.

The platform must support multiple asset domains without putting domain-specific logic into the Market Core.

The central reusable unit is the **Asset Protocol**, not the token.

> Real-world experts define how an asset becomes eligible, verifiable and investable. Commodity Chain converts those approved rules into repeatable financial-instrument lifecycles.

---

## 2. Target architecture

```text
REAL WORLD
  |
  |-- stored grain
  |-- future harvest
  |-- water infrastructure / rights
  |-- music commercial rights
  |-- future asset classes
  v

PROTOCOL LAYER
  |
  |-- Grain Protocol
  |-- Field-to-Finance Protocol
  |-- Water Protocol
  |-- Music Rights Protocol
  |-- future protocols
  v

ASSET / RIGHTS VERIFICATION
  |
  |-- source-of-truth evidence
  |-- verifier / oracle
  |-- eligibility checks
  |-- valuation / quantity rules
  |-- legal rights object
  v

INSTRUMENT FACTORY
  |
  |-- issuer / SPV / SPC
  |-- protocol version binding
  |-- issuance parameters
  |-- coverage / collateral rules
  |-- disclosures
  v

REGISTRAR / MARKET CORE
  |
  |-- admission
  |-- primary placement
  |-- holdings / registry
  |-- secondary market
  |-- clearing
  |-- settlement
  v

SERVICING / REDEMPTION
  |
  |-- monitoring
  |-- cash-flow waterfall
  |-- defaults / enforcement
  |-- redemption / maturity
```

The architecture is intentionally layered. Asset-specific rules belong to protocols and adapters. Generic market functions belong to Market Core.

---

## 3. Domain hierarchy

The canonical hierarchy is:

```text
Platform
  -> Protocol Registry
      -> Asset Protocol + immutable version
          -> verified Asset / Rights Object
              -> Issuer / SPV / SPC
                  -> Investment Instrument
                      -> Issuance
                          -> Market / Placement
                              -> Clearing / Settlement
                                  -> Servicing / Redemption
```

Do not collapse these concepts into one entity.

### Protocol is not an instrument

A protocol defines reusable rules. Example: `FIELD_TO_FINANCE v1.2`.

An instrument is a concrete financial instrument created under those rules. Example: `WHEAT-2027`.

An issuance is a concrete issuance event of an instrument. Example: `ISS-001`.

A pool, DAC, warehouse receipt, field snapshot, music-rights package or water-well evidence is backing / rights infrastructure, not a market instrument by itself unless explicitly structured and admitted as one.

---

## 4. Asset Protocol

An **Asset Protocol** is an approved, versioned set of legal, economic, verification and technical rules that explains how a defined class of real-world asset or right can become the economic basis of an investment instrument and how that instrument is maintained through its lifecycle.

Every protocol should be able to define, where applicable:

1. Identity and protocol owner
2. Eligible asset / right
3. Eligible originator / producer
4. Required documents and evidence
5. Source of truth
6. Verification rules
7. Verifier / oracle roles
8. Quantity / valuation methodology
9. Rights-creation mechanism
10. Eligibility and admission prerequisites
11. Instrument structure
12. Issuance constraints
13. Coverage / collateral / reserve rules
14. Monitoring rules
15. Financing / proceeds rules
16. Cash-flow waterfall
17. Default events
18. Enforcement / remediation
19. Redemption / maturity
20. Fees
21. Governance and amendment rules
22. Required disclosures

Protocols may use different modules. The schema must be extensible; do not hard-code the assumption that every protocol has fields, DACs, pools, insurance or elevators.

---

## 5. Protocol versioning is mandatory

Protocols are immutable by version.

```text
FIELD_TO_FINANCE v1.0
FIELD_TO_FINANCE v1.1
FIELD_TO_FINANCE v2.0
```

A new protocol version may change eligibility, verification, haircut, coverage, monitoring, fee or redemption rules, but must not silently rewrite the governing rules of already-created instruments.

Every instrument must retain a permanent reference to the exact protocol version under which it was created.

```text
Instrument: WHEAT-2027
Protocol: FIELD_TO_FINANCE
Protocol version: 1.1
```

Agents must never implement `protocol = mutable current rules` for already-issued instruments.

---

## 6. Protocol Owner

A protocol may have a dedicated **Protocol Owner**: typically an SPV, SPC, JV, industry consortium or other permitted legal vehicle that owns or governs the protocol methodology and ecosystem.

The commercial model may allow the Protocol Owner to receive a small fee whenever an instrument is created or serviced under that protocol.

Possible fee models include:

- protocol usage / licensing fee;
- issuance-linked protocol fee;
- lifecycle / servicing fee;
- fixed + variable model.

Exact economics are protocol-specific and configurable.

### Critical role separation

`ProtocolOwner` must not be treated as automatically equal to any of:

- Issuer
- Asset Manager
- Arranger
- Exchange
- Clearing House
- Registrar
- Custodian
- Verifier
- Oracle
- Stablecoin Issuer

One legal entity may perform multiple roles only when intentionally configured and legally permitted.

Protocol-owner economics are a commercial architecture concept. Their final legal/regulatory characterization must be validated separately. Agents must not infer a regulated permission from this document.

---

## 7. Why Protocol Owners exist

The platform should create an incentive for real-market experts to standardize new asset classes with Commodity Chain instead of building separate exchanges.

```text
Industry / domain expert
  +
Commodity Chain product + regulatory + market infrastructure
  ->
New approved protocol
  ->
Repeatable instruments
  ->
Protocol-owner economics on usage
```

This creates a protocol network effect: more protocols -> more originators, verifiers and issuers -> more instruments -> more investor utility -> more incentive to create protocols.

The long-term moat is the institutional protocol network and its verified lifecycle data, not only the matching engine or blockchain implementation.

---

## 8. Current protocol families

### 8.1 Grain Protocol — stored grain

Purpose: instruments economically backed by grain already stored and verified.

Typical protocol-specific components:

```text
Asset: grain physically stored
Verifier: approved elevator / warehouse
Source of truth: warehouse / electronic grain receipt evidence
Quantity: certified eligible weight
Quality: protocol-defined grain specifications
Rights: warehouse / contractual / registry rights structure
Monitoring: warehouse + registry status
Release / redemption: protocol-defined cash or physical settlement
```

Do not put elevator, grain-quality or warehouse-receipt logic into generic Market Core entities.

### 8.2 Field-to-Finance Protocol — financing future harvest

Purpose: forward financing against verified rights and economic value associated with a future harvest.

Canonical lifecycle:

```text
Field
  -> SCAS Verification
  -> Verified Field Snapshot
  -> DAC Rights Object
  -> Registrar
  -> Pool
  -> Coverage
  -> Investment Instrument
  -> Primary Market
  -> Secondary Market
  -> Financing / Redemption
```

Important distinctions:

- Verified Field Snapshot is not a token.
- DAC Rights Object is not the grain and is not automatically an investment instrument.
- DAC, pool, coverage and SCAS are Field-to-Finance modules, not global Market Core concepts.
- financing may be milestone / tranche based.

Current implementation status is defined separately in `docs/MARKET_CORE_ARCHITECTURE.md`.

### 8.3 Water Protocol

Purpose: create investable instruments from an approved legal/economic structure around water wells or related infrastructure/rights.

Potential modules may include:

```text
Asset / basis: permitted well / infrastructure / contractual economics
Verification: licences, geology, commissioning evidence
Oracle: metered extraction / operational data
Revenue source: buyer / tariff / service or offtake agreement
Monitoring: technical + metering data
Risk: technical, regulatory, demand, counterparty
Cash flow: protocol-defined waterfall
```

Water is currently a structuring concept unless implementation-status docs say otherwise. Do not invent an admitted water instrument.

### 8.4 Music Rights Protocol

Purpose: create investable instruments based on defined commercial copyright / royalty rights.

Potential modules may include:

```text
Asset / basis: defined commercial rights or royalty participation
Verification: rights registry + contracts
Valuation: historic and contractual royalty data
Oracle: distributor / DSP / collection data
Cash flow: royalty receipts
Waterfall: rightsholder / investor / service fees
Lifecycle: monitoring, distributions, expiry / redemption
```

Music Rights is currently a structuring concept unless implementation-status docs say otherwise. Do not invent an admitted music instrument.

---

## 9. Market Core must be asset-agnostic

Market Core must understand generic financial-market concepts:

- Participant
- Eligibility
- Protocol reference
- Instrument
- Issuer
- Issuance
- Market
- Order
- Trade
- Holding
- Reservation
- Clearing obligation
- Settlement
- Registry entry
- Restriction / block / pledge
- Corporate / lifecycle event
- Redemption
- Audit event

Market Core must **not** need to understand what wheat protein, hectares, well debit, Spotify royalties or a SCAS field inspection means.

Forbidden architecture pattern:

```text
if instrument.assetType == "WHEAT":
    // market-core special case
```

Preferred pattern:

```text
ProtocolAdapter
  -> verifies domain-specific conditions
  -> emits normalized eligibility / rights / issuance / lifecycle facts
  -> Market Core consumes normalized facts
```

Use typed protocol modules and adapters rather than asset-name conditionals in generic market services.

---

## 10. Protocol Engine

The target platform should have a logical **Protocol Engine** responsible for evaluating protocol-defined rules without becoming the exchange itself.

Conceptually:

```text
Protocol Registry
       |
       v
Protocol Engine
       |
       |-- eligibility evaluation
       |-- required evidence
       |-- verifier/oracle state
       |-- rights state
       |-- issuance preconditions
       |-- lifecycle conditions
       |-- fee schedule
       |-- servicing / redemption rules
       v
Normalized Protocol Facts
       |
       v
Instrument Factory / Market Core
```

Implementation may begin as domain services and configuration rather than a generic DSL. Do not prematurely build a no-code protocol language before real protocol requirements justify it.

---

## 11. Instrument Factory

`Instrument Factory` is a logical capability, not necessarily one microservice.

It binds:

```text
verified asset / rights object
+ exact protocol version
+ issuer / legal vehicle
+ instrument terms
+ eligibility / coverage state
+ fee schedule
+ disclosures
-> proposed / issued Investment Instrument
```

Instrument creation must be auditable and reproducible from the governing protocol version and evidence set.

The platform should eventually support multiple instrument families; protocol-specific asset instruments and investments into a protocol-owning vehicle must remain distinct products with distinct rights and risk.

---

## 12. Registrar and source-of-truth boundaries

The platform must distinguish:

- real-world source of truth;
- protocol verification evidence;
- legal rights / registrar record;
- blockchain representation;
- Market Core holding / settlement state.

A blockchain token is not automatically the legal source of truth for the underlying real-world asset.

The registrar / legal book-of-record design must remain explicit per instrument and jurisdiction.

---

## 13. Market, Clearing and Settlement

Keep these separate:

```text
Market:
Order -> Matching -> Trade

Clearing:
Trade -> eligibility recheck -> obligations -> reservations -> settlement instructions

Settlement:
cash / settlement-asset leg <-> instrument leg -> finality
```

All protocols should ultimately use the same generic Market Core and Clearing Core unless a legally necessary market structure requires otherwise.

Do not create separate grain, water or music matching engines.

---

## 14. Settlement is a platform capability, not an F2F feature

Cash / settlement architecture must be reusable across all protocols.

Target abstraction:

```text
Grain ---------\
F2F ------------+--> Commodity Chain Clearing --> Settlement Rail
Water ----------+                                  |-- Bank KZT
Music ----------+                                  |-- KZT stablecoin
Future --------/                                   |-- future approved rails
```

The core should model `SettlementAsset` and `SettlementProvider` / adapter abstractions rather than hard-code one bank, stablecoin or wallet provider.

### Current strategic rails

1. **Bank KZT rail** — conventional fiat settlement.
2. **KZT stablecoin rail** — strategic target / regulated digital-cash settlement rail.
3. **Binance Kazakhstan** — potential future custody, wallet, money-service or gateway adapter for the stablecoin / digital-cash leg, subject to commercial, technical and regulatory validation.

Binance must not become the Market Core or a second order book. Do not add Binance SDKs, secrets or runtime assumptions unless a separate approved implementation task explicitly requires them.

Likewise, do not assume a current KZT stablecoin can already settle an AIFC Investment Token without the required regulatory/admission work.

---

## 15. Protocol fees and settlement waterfall

Protocol economics should be represented explicitly and audibly, not hidden in ad-hoc code.

Illustrative only:

```text
Primary proceeds
  -> net financing / issuer proceeds
  -> Commodity Chain platform fee
  -> Protocol Owner fee
  -> verifier / oracle fee
  -> insurance / coverage fee
  -> other disclosed service fees
```

Each actual fee must come from the governing protocol / issuance configuration and applicable legal terms.

Agents must never hard-code illustrative percentages as production economics.

---

## 16. Distribution channels

Different user channels must access the same underlying Market Core.

Potential channels:

- institutional web portal;
- producer / verifier workspaces;
- retail application;
- broker / API distribution;
- regulated wallet / custody integrations.

A new frontend, wallet or partner integration is a channel / adapter, not a new market or new source of instrument truth.

---

## 17. Cross-cutting auditability

Every important transition must be attributable and reconstructable:

- who submitted evidence;
- which verifier approved it;
- which protocol version evaluated it;
- what rules passed / failed;
- which rights object was created;
- who approved issuance;
- what instrument terms were bound;
- what fees applied;
- what market / clearing / settlement events occurred;
- what lifecycle / redemption event closed the instrument.

Prefer append-only domain events / audit records for consequential transitions.

---

## 18. Agent implementation rules

Before changing domain architecture, every agent must read:

1. `docs/PROTOCOL_PLATFORM_ARCHITECTURE.md` — strategic target / domain canon.
2. `docs/MARKET_CORE_ARCHITECTURE.md` — current implementation and phase status.
3. `AGENTS.md` and any framework-specific local guidance.

Agents must preserve these invariants:

- Commodity Chain is multi-protocol; F2F is one protocol.
- Protocol != Asset/Rights Object != Issuer != Instrument != Issuance.
- Protocol Owner != Issuer by default.
- Protocol versions are immutable for already-created instruments.
- Market Core stays asset-agnostic.
- Domain verification lives in protocol modules / adapters.
- All channels route into one Market Core.
- Market, Clearing and Settlement remain separate concepts.
- Settlement rails are adapters; no provider is hard-coded into the core.
- Do not represent FUTURE / STRUCTURING / CONCEPT functionality as implemented.
- Do not imply regulatory permission that has not been explicitly established.
- Do not fabricate admitted instruments, live trades, client balances, custody or settlements for demo convenience.

When a requested implementation conflicts with this canon, stop and surface the conflict before introducing a shortcut into core architecture.

---

## 19. Product direction

The intended long-term flywheel is:

```text
Industry participant identifies financeable real-world asset class
  -> co-designs protocol with Commodity Chain
  -> protocol is legally / operationally structured and approved
  -> verified originators create eligible asset / rights objects
  -> instruments are repeatedly created under immutable protocol versions
  -> instruments use shared market / clearing / settlement infrastructure
  -> Protocol Owner receives disclosed protocol economics
  -> successful protocol attracts more originators, verifiers and capital
  -> ecosystem expands into new protocols
```

This is the strategic architecture that future platform development should optimize for.
