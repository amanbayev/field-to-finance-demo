# Commodity Chain — Product Canon

**Status:** Authoritative product document. Read before any product, UI, navigation, copy or
layout work.
**Legal operator:** CommoChain Ltd.
**Companion documents:** `DESIGN.md` (design authority), `docs/PROTOCOL_PLATFORM_ARCHITECTURE.md`
(target domain architecture), `docs/MARKET_CORE_ARCHITECTURE.md` (implementation status).

This document describes a **demonstrator**. It does not claim regulatory approval, admitted
instruments, client money, custody arrangements, or settlement finality.

---

## 1. What Commodity Chain is

Commodity Chain is regulated-market infrastructure for creating, issuing, trading, clearing,
settling and servicing protocol-based investment instruments backed by real-world assets or
rights.

It is a **multi-protocol platform**. It is not a grain product, not a token, and not a single
market.

**Field to Finance is one protocol operating on Commodity Chain.** It is the active agriculture
demonstrator. It is not the platform, not the brand, and not the product name. Water, Music
Rights and Gaming Assets are further protocol concepts at earlier stages, and the platform must
read as credible for them without agriculture language or imagery.

---

## 2. Canonical hierarchy

```text
Commodity Chain
  → Protocol
      → Protocol Version
          → Instrument
              → Issuance
                  → Market
```

Every product surface must make clear which level the user is standing on.

These concepts are permanently distinct and must never be collapsed:

```text
Protocol != Protocol Version != Asset/Rights Object != Instrument != Issuance != Market
```

- A **Protocol** is a reusable set of rules for turning a class of real-world asset or right into
  an investable instrument. Example: Field to Finance.
- A **Protocol Version** is an immutable recorded version of those rules. Example: `F2F-V1.1`.
  An issued instrument is bound permanently to the exact version it was created under and never
  follows a later one.
- An **Asset / Rights Object** is verified backing (a field snapshot, a DAC, a pool). It is not an
  instrument.
- An **Instrument** is a concrete investable instrument. Example: `WHEAT-2027`.
- An **Issuance** is a concrete issuance event of an instrument. Example: `ISS-001`.
- A **Market** is where orders meet. It is not clearing and not settlement.

**Protocol Owner is not automatically the Issuer**, and neither is automatically the platform
operator, registrar, custodian, verifier or exchange. One legal entity may hold several roles only
when that is intentionally configured and legally permitted.

---

## 3. Audiences and the jobs they do

| Audience | The job they come to do |
| --- | --- |
| **Producer** | Register a field, submit evidence, follow their contract through verification, and see financing status against their own production. Single-protocol operator; speaks plain language, not institutional jargon. |
| **Institutional investor** | Understand what an instrument actually is, what backs it, which protocol version governs it, what the risk and coverage model is, and what they hold. Needs density, provenance and comparability. |
| **Registrar** | Maintain the legal book of record: admit, place, register ownership, and keep the registry reconcilable against evidence. Non-discretionary. |
| **Compliance officer** | Assess participant × instrument eligibility, run screening, and record why a decision was made. Never a trading role. |
| **Regulator** | Read-only surveillance across markets, instruments, issuances, clearing, registry and audit. Must be able to reconstruct what happened and under which rules. |
| **Administrator** | Operate users, organisations, roles and demo personas. A system role, not a market participant; an unimpersonated administrator has no participant identity and cannot trade. |

A protocol-specific workspace (fields, SCAS, pools, coverage) belongs to the protocol that defines
it. A platform surface (markets, instruments, registry, clearing, supervision, audit) belongs to
Commodity Chain and must work for any protocol.

---

## 4. Implemented versus future

**Implemented today**

- Multi-protocol registry with Field to Finance as the active demonstrator protocol.
- Immutable protocol versioning; `F2F-V1.1` recorded, frozen, with `WHEAT-2027` permanently bound.
- Generic Market Core: instrument, market, order, trade, holding, eligibility matrix.
- Secondary LIMIT matching (preview) that stops at `AWAITING_DEVNET_SETTLEMENT`.
- Registrar book of record, separate from the market balance projection.
- Field to Finance origination: fields, SCAS verification, DAC rights objects, pools, coverage.
- Institutional web portal as the only active distribution channel.

**Structuring or concept — never shown as implemented**

- Water, Music Rights and Gaming Assets protocols. No versions, no instruments, no markets.
- Protocol Investment as an instrument family. No offering, not issued, not admitted.
- Retail application and broker/API distribution channels.

**Deliberately deferred to later phases**

- Money and settlement: funding, cash subledger, reserves, holds, withdrawals, reconciliation
  (Phase 6).
- Real delivery-versus-payment execution and settlement finality (Phase 7).
- A configurable protocol lifecycle and governance engine (Phase 8).

---

## 5. Truthfulness requirements

These are product requirements, not stylistic preferences. A surface that breaks one of them is a
defect regardless of how it looks.

- Never imply regulatory permission, admission or approval that has not been established.
- Never present a demonstrator lifecycle state as legal or governance activation.
- Never invent instruments, issuances, markets, protocol versions, owners, prices, yields, terms,
  governance dates or on-chain figures — including to fill an empty group or make a screen look
  complete. An empty state is correct when the thing is genuinely absent.
- Never show an offer, price, yield or settlement capability for something that has none.
- **The Registrar is the legal book of record.** Registered ownership changes only on registrar
  evidence.
- **Matching does not change legal ownership.** `MATCHED`, `FILLED`, `CLEARING_READY` and
  `AWAITING_DEVNET_SETTLEMENT` do not mean `SETTLED`.
- Missing data is stated as missing. A date that has not been established is shown as not claimed,
  never backfilled with a plausible value.
- Kazakh, Russian and English are equal. Internal canonical English records are never rendered
  directly to a user in a Russian or Kazakh interface.

---

## 6. Global platform versus protocol responsibilities

**Commodity Chain (global, asset-agnostic)** — participants, eligibility, instruments, issuances,
markets, orders, trades, holdings, clearing obligations, settlement, registry, restrictions,
lifecycle events, audit. This layer must never need to know what wheat protein, a hectare, a well
debit or a royalty statement means.

**Protocol (asset-specific)** — eligible assets and originators, required evidence, source of
truth, verification and verifier roles, quantity and valuation methodology, rights creation,
coverage and collateral rules, monitoring, waterfall, default and redemption rules.

Asset-specific verification belongs in protocol modules and adapters. The forbidden pattern is an
asset-name conditional inside a generic service; the correct pattern is a protocol adapter that
emits normalized facts the Market Core consumes.
