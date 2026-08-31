<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Commodity Chain protocol/platform canon

Before changing platform domain models, protocol logic, instruments, market structure, clearing, settlement, custody, registrar behavior, or asset origination, read:

1. `docs/PROTOCOL_PLATFORM_ARCHITECTURE.md`
2. `docs/MARKET_CORE_ARCHITECTURE.md`

Preserve these invariants:

- Commodity Chain is a multi-protocol platform. Field-to-Finance is one protocol, not the platform itself.
- Protocol != Asset/Rights Object != Issuer != Instrument != Issuance.
- Protocol Owner != Issuer by default.
- Issued instruments bind to an exact immutable Protocol Version.
- Market Core must remain asset-agnostic.
- Asset-specific verification belongs in protocol modules/adapters, not Market Core.
- Market, Clearing, and Settlement are separate concepts and lifecycle stages.
- Registrar / registered ownership remains the legal book of record unless architecture and legal basis explicitly change.
- Matching must not mutate legal ownership.
- MATCHED / FILLED / CLEARING_READY / AWAITING_DEVNET_SETTLEMENT != SETTLED.
- Settlement providers and settlement assets must be adapters; do not hardcode Binance, stablecoin, bank, or a particular rail into Market Core.
- FUTURE / STRUCTURING / CONCEPT functionality must never be represented as implemented.
- Never fabricate regulatory permissions, admitted instruments, live trades, client balances, custody arrangements, wallets, ATAs, or settlement finality.
- If an implementation request conflicts with these invariants, surface the conflict before changing the core architecture.
