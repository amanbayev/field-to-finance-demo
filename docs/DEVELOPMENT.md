# Development guide

This guide is the shared workflow for people using a conventional editor, Codex, or
Claude Code. Tool-specific plugins are optional; repository rules and validation are
the same for everyone.

## 1. Workstation prerequisites

- Git
- Node.js `22.23.2` (see `.nvmrc`)
- npm `10.9.x` or another npm version compatible with lockfile version 3
- GitHub CLI (`gh`) is recommended for pull requests

With `nvm` installed:

```bash
nvm install
nvm use
node --version
npm --version
```

Codex and Claude Code are optional clients. Claude Code users may install personal
plugins such as ECC, but those plugins are not required and their user settings must
not be copied into the repository.

## 2. Clone and bootstrap

```bash
git clone --branch develop https://github.com/amanbayev/field-to-finance-demo.git
cd field-to-finance-demo
nvm use
npm ci
npm run check
```

Copy `.env.example` to `.env.local` only when local overrides are needed. Local
development uses mock providers by default; never copy production secrets or wallet
material into the repository.

Start the application:

```bash
npm run dev
```

Open `http://localhost:3000`.

## 3. Branch model

| Branch | Purpose | Direct feature work |
| --- | --- | --- |
| `main` | Production and Vercel production source | No |
| `develop` | Reviewed integration baseline | No |
| `feature/*`, `fix/*`, `chore/*`, `docs/*` | One bounded change | Yes |

Start work from the latest integration baseline:

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/short-description
```

Open pull requests into `develop`. Release pull requests move reviewed changes from
`develop` to `main`. Do not force-push shared branches or mix unrelated work in one
pull request.

## 4. Source-of-truth instructions

- `AGENTS.md` contains universal architecture and engineering rules.
- `CLAUDE.md` imports `AGENTS.md` for Claude Code.
- Codex reads `AGENTS.md` directly.
- `.cursor/rules/` contains scoped Cursor UI rules; it does not override the platform
  and market invariants in `AGENTS.md`.

Before domain or platform changes, read:

1. `docs/PROTOCOL_PLATFORM_ARCHITECTURE.md`
2. `docs/MARKET_CORE_ARCHITECTURE.md`

Current sequencing after Phase 5C.4B:

1. **Demo Golden Path V2** — one end-to-end run created through the UI from a clean
   business state, including Demo Dataset V2 reset/seed tooling. Read
   `docs/DEMO_GOLDEN_PATH_V2.md` before touching demo data, seeding, environment
   gating or the origination-to-placement flow. GP-00 and the read-only GP-01 planner, run registry and
partial row isolation exist today; there is no reset execution path and no run issuance.
2. **Platform and repository naming migration**, after Golden Path V2 acceptance. Not
   started.
3. **Phase 5C.5** — design, UX, i18n and accessibility polish.
4. **Exchange Core** — CLOB / order book, market operations and negotiated deals.
5. **Phase 6 — Money & Settlement**: bank-confirmed funding, cash subledger, reserves,
   holds, withdrawals, reconciliation, explicit client-money controls, and pre-trade
   risk.
6. **Phase 7 — Real DvP**: execute and prove the real delivery-versus-payment path.
7. **Phase 8 — Protocol Engine**: configurable protocol lifecycle and governance.

Do not pull Exchange Core or Phase 6–8 functionality into Golden Path V2, and do not
label prepared or future behavior as implemented. Phase 5C slice detail and the
retained backlog live in `docs/PHASE_5C_PLAN.md`.

## 5. Validation

Run the standard local gate:

```bash
npm run check
```

This runs ESLint, TypeScript, and the non-live Vitest suite. It must not contact shared
Supabase or mutate Solana Devnet.

Run a production build when the change touches Next.js routes, rendering boundaries,
configuration, or deploy behavior:

```bash
npm run build
```

`npm run test:origination:live` is destructive integration coverage. Use it only with
`RUN_LIVE_ORIGINATION_TESTS=1` against an explicitly approved QA Supabase project.
Never point it at the shared demo database by default.

The current Solana packages can report transitive `bigint-buffer` and `uuid` advisories.
Do not run `npm audit fix --force`: npm currently proposes breaking Solana downgrades.
Treat dependency remediation as a reviewed, tested change.

## 6. Commit and pull-request workflow

Use small commits with an imperative Conventional Commit subject, for example:

```text
feat: bind instruments to immutable protocol versions
fix: reject non-live incoming orders from matching
docs: document the Phase 5C delivery boundary
```

Before requesting review:

```bash
git status --short
git diff --check
npm run check
```

The pull request must state:

- the problem and intended outcome;
- architecture or regulatory-truth implications;
- tests performed and their result;
- environment, migration, Devnet, or deployment impact;
- explicit limitations and deferred functionality.

AI assistants may prepare code, tests, commits, and pull-request text, but they should
only push, deploy, migrate, or merge when the human operator explicitly requests it.
