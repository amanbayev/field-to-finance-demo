## Commodity Chain domain architecture

Before changing platform domain models, protocol logic, instruments, clearing, settlement, custody, or market structure, read:

1. `docs/PROTOCOL_PLATFORM_ARCHITECTURE.md` — strategic multi-protocol platform canon.
2. `docs/MARKET_CORE_ARCHITECTURE.md` — current implementation and phase status.

Key invariants:
- Commodity Chain is multi-protocol; Field-to-Finance is one protocol.
- Protocol != Asset/Rights Object != Issuer != Instrument != Issuance.
- Protocol Owner != Issuer by default.
- Protocol versions are immutable for already-created instruments.
- Market Core must remain asset-agnostic.
- Domain verification belongs in protocol modules/adapters.
- Market, Clearing and Settlement are separate concepts.
- Settlement providers (bank, stablecoin, custody/wallet partners) are adapters, never hard-coded into Market Core.
- Never present FUTURE / STRUCTURING / CONCEPT functionality as implemented or regulatory permission as granted.

If an implementation request conflicts with these rules, surface the conflict before changing core architecture.
