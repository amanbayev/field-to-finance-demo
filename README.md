# Field to Finance

Public demonstration prototype for **digital agricultural finance infrastructure**.

The product shows how rights to future agricultural production can be digitally verified, pooled, risk-adjusted, tokenized and financed:

Field → Digital Agricultural Contract → Verification → Contract Pool → Risk Assessment → Eligible Contract Coverage → Agricultural Token → Primary Placement → Secondary Market → Collateral / Secured Financing → Repayment or Default

This is **not** a production financial product. No real agricultural assets, funds, securities, contractual rights or legal obligations are created or transferred.

Permanent UI badge: `PROTOTYPE · SOLANA DEVNET`

## Current phase

**Phase 0.2 — Public deployment foundation**

Phase 0 public UI and Phase 0.1 localization, plus a public Vercel deployment and documented environment configuration.

Phase 0 still uses **mock blockchain data**. Solana Devnet integration begins in Phase 1. The public URL stays the same as later phases are deployed.

Phase 1 (Solana Devnet connection) has not been started.

## Languages

Supported locales:

| Code | Language | Switcher |
| --- | --- | --- |
| `kk` | Kazakh | ҚАЗ |
| `ru` | Russian | РУС |
| `en` | English | ENG |

Default locale: **Kazakh (`kk`)**.

Missing translation keys fall back to English. The selected language is stored in the `ftf-locale` cookie and kept across visits. Changing language refreshes the current page; routes such as `/contracts` are unchanged.

### Localization architecture

The app uses `next-intl` **without locale prefixes** in the URL.

```
messages/
  en.json
  ru.json
  kk.json
src/i18n/
  config.ts          locales, cookie name, default
  request.ts         reads cookie, merges English fallback
  actions.ts         setLocale server action
  merge-messages.ts
```

UI copy lives in the message catalogs, not in page components. Domain enums (`VERIFIED`, `IN_POOL`, …) are unchanged; only their presentation is translated.

## Currency formatting

Kazakhstan tenge is the primary display currency. USD is a secondary reference only.

```
src/domain/money.ts              Money { amount, currency }
src/adapters/fx/config.ts        BASE_CURRENCY, REFERENCE_CURRENCY, DEMO_USD_KZT_RATE
src/adapters/fx/demo-fx-provider.ts
src/lib/format.ts                formatMoney(), toPrimaryAndReference()
src/components/shared/dual-money.tsx
```

Demo FX configuration:

- `BASE_CURRENCY=KZT`
- `REFERENCE_CURRENCY=USD`
- `DEMO_USD_KZT_RATE=500` (1 USD = 500 KZT)

This rate is a **fixed demonstration reference**, not a live market quote. It is defined once in `src/adapters/fx/config.ts` and consumed through `FxProvider`.

A later live provider can implement the same `FxProvider` interface (`getQuote`, `convert`) and replace `DemoFxProvider` in `src/adapters/fx/index.ts` without changing product pages.

Example:

₸620,000,000  
≈ $1.24M


## Tech stack

- Next.js 16 (App Router)
- React 19
- TypeScript (strict)
- Tailwind CSS 4
- shadcn/ui
- next-intl
- npm

Inspected local toolchain when this project was scaffolded:

- Node.js `v24.19.0`
- npm `11.17.0`
- Git `2.54.0.windows.1`
- Vercel CLI: `npx vercel` (not installed globally)

## Architecture

Product domain logic does not talk to a chain SDK or a KYC vendor directly. UI pages call services. Services read mock data today and will later call APIs, a database, or adapters.

```
src/
  app/                 UI routes
  components/          Layout and product UI
  domain/              Typed business models
  data/mock/           Replaceable demonstration data
  services/            Product use-cases
  adapters/
    blockchain/        BlockchainProvider + MockBlockchainProvider
    compliance/        KycProvider, KybProvider, KytProvider + mocks
    fx/                FxProvider + DemoFxProvider
  i18n/                Locale config and request setup
  lib/                 Formatting, navigation, and public env defaults
```

### Blockchain adapter

```ts
interface BlockchainProvider {
  getNetworkStatus()
  issueToken()
  getTransaction()
}
```

Phase 0 and 0.2 use `MockBlockchainProvider`, selected by `NEXT_PUBLIC_BLOCKCHAIN_PROVIDER=mock` (the default). A later `SolanaBlockchainProvider` can implement the same interface without rewriting contracts, pools, coverage or UI flows. If the Solana provider name is set before Phase 1 exists, the app stays on mock and does not fail.

### Compliance adapters

```ts
interface KycProvider { getKycStatus(participantId) }
interface KybProvider { getKybStatus(participantId) }
interface KytProvider { getKytStatus(participantId) }
```

Phase 0 uses mock providers labelled **Demo Compliance Provider**. Sumsub, TRM or another vendor can be added behind these interfaces later.

## Routes

| Path | Module |
| --- | --- |
| `/` | Dashboard |
| `/contracts` | Digital Agricultural Contracts |
| `/contracts/[contractId]` | Contract detail |
| `/pools` | Contract pools |
| `/pools/[poolId]` | Pool detail, haircuts and coverage |
| `/tokens` | Agricultural token series |
| `/finance` | Secured loan and repo placeholders |
| `/compliance` | Compliance control center |
| `/regulator` | Regulator view and audit trail |

## How to run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Other commands:

```bash
npm run lint
npm run typecheck
npm run build
npm run start
```

## Future Solana architecture

Target network: **Solana Devnet**.

Planned split:

1. Keep domain objects (`DigitalAgriculturalContract`, `ContractPool`, `AgriculturalToken`, `ContractCoverage`) chain-agnostic.
2. Implement `SolanaBlockchainProvider` for network status, Token-2022 issuance, and transaction lookup.
3. Attach Solana signatures to `AuditEvent` records when they exist.
4. Keep the UI “Issue on Solana” action disabled until Phase 1.

No program, wallet adapter, or transaction construction is included in Phase 0.

## Future compliance architecture

Planned split:

1. Keep `Participant` and `ComplianceRecord` in the domain layer.
2. Replace mock KYC/KYB/KYT providers with vendor adapters.
3. Continue to surface provider name in the UI so checks are never presented as native legal determinations.

No Sumsub or TRM integration is included in Phase 0.

## Roadmap

| Phase | Scope |
| --- | --- |
| Phase 0 | Public UI prototype |
| Phase 0.1 | Localization and Kazakhstan formatting |
| Phase 0.2 | Public deployment foundation |
| Phase 1 | Solana Devnet connection |
| Phase 2 | Digital Agricultural Contract Registry |
| Phase 3 | Contract Pools and Coverage Engine |
| Phase 4 | Token-2022 issuance |
| Phase 5 | Compliance Gateway |
| Phase 6 | Primary Placement / DvP |
| Phase 7 | Secured Financing |
| Phase 8 | Risk Monitoring and Coverage Events |
| Phase 9 | Default / Enforcement Demo |

## Public Demo

| Item | Value |
| --- | --- |
| Production URL | https://field-to-finance-demo.vercel.app |
| Preview URL | https://field-to-finance-demo-554bbx2as-amanbayts-projects.vercel.app |
| Platform | Vercel |
| Vercel project | `field-to-finance-demo` |
| GitHub | https://github.com/amanbayev/field-to-finance-demo |

This is the stable public URL for the prototype. Later phases (including Solana Devnet in Phase 1) should keep deploying to the same production hostname.

### Deployment process

The app is a standard Next.js project on Vercel.

Preview (current working tree):

```bash
npx vercel
```

Production:

```bash
npx vercel --prod
```

If the CLI is not logged in, run `npx vercel login` first. Do not place Vercel tokens, GitHub credentials, wallet files, or API secrets in this repository.

Continuous deployment: connect this GitHub repository to the Vercel project (`npx vercel git connect`). Subsequent pushes to the connected branch create preview or production deployments according to the Vercel project settings.

### Environment configuration

Public variables (safe to expose in the browser). Copy `.env.example` to `.env.local` for local overrides:

```bash
NEXT_PUBLIC_APP_ENV=demo
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_BLOCKCHAIN_PROVIDER=mock
```

These are also set on the Vercel project for Production, Preview, and Development.

Defaults live in `src/lib/public-env.ts`. The application must not crash if future Solana variables are absent: missing values fall back to the demo defaults above, and `MockBlockchainProvider` remains active in Phase 0.2.

Do not put private keys, seed phrases, wallet JSON, or secret API credentials in `NEXT_PUBLIC_*` variables. Those would be inlined into the client bundle.
