---
name: harvest-capital-ui
description: >-
  Design language for the Field to Finance / CommoChain surface on branch ui/redesign.
  Use when building, restyling, or reviewing any UI, CSS, layout, component, empty state,
  loader, motion, typography, or locale-facing copy. Encodes a 2026 cinematic capital-markets
  product that must not look like generic AI UI.
---

# Harvest Capital UI

This is the design lead brief for the `ui/redesign` branch. The previous two attempts (olive IBM Plex admin, then gray institutional card chrome) are **anti-references**. Do not revive them.

## Verbatim product brief

Honor these requirements exactly:

- I don't want generic AI UI.
- I need UI and UX that is smart and modern, 2026 version.
- I do need images and micro animations where applicable, empty states, loaders — this way UI becomes smart.
- I do need better typography and supports kz en ru locales.
- I do want this app to create wow effect.
- Under the hood it's a sophisticated project. But on the surface it still needs to look like a multiple hundreds of thousands of dollars product.

Locale codes in code are `kk`, `ru`, `en` (Kazakh is `kk`, labeled ҚАЗ). Every new string ships in all three catalogs (`messages/en.json`, `messages/kk.json`, `messages/ru.json`).

## What this product is

CommoChain operates an investment-token platform. Field to Finance is the agriculture protocol on it: a field in Kazakhstan becomes verified production, a pool, a token, a placement, then settlement. Users are issuers, investors, registrars, traders, compliance, regulators.

The surface must feel like a **private harvest exchange at dusk** — land, grain, and a live book in the same room. Not a farm SaaS. Not a crypto terminal. Not a government portal.

## Aesthetic direction (locked)

**Name:** Nocturnal harvest.  
**Risk:** Full-bleed cinematic photography of the actual subject (wheat, silo, grain) is the hero thesis, not a stock illustration in a card. Live figures sit *on* the land.

**Signature people remember:** a breathing dusk field, Unbounded display type, one harvest-gold filament, an as-of clock that ticks.

Spend boldness there. Everything else is quiet, dense, and expensive.

### Palette (do not freelance)

| Token | Hex | Use |
|---|---|---|
| Ink | `#12100C` | Page ground |
| Bone | `#EDE6D6` | Primary text |
| Harvest | `#D4A017` | Primary actions, live filament, focus |
| Straw | `#9A8A62` | Secondary labels |
| Pulse | `#3D9B8A` | Settlement / connected, rare |
| Ember | `#C45C3E` | Destructive / breach |

CSS variables in `src/app/globals.css` are the source of truth. Derive from them; do not introduce purple, neon green, or sky blue.

### Typography (Cyrillic + Kazakh required)

| Role | Face | Notes |
|---|---|---|
| Display | **Unbounded** (Latin only) | English wordmark (`.font-wordmark`) and Latin display. Use `Unbounded-Latin.ttf` — Chrome ignores `unicode-range` on a full variable TTF once it is loaded, so Cyrillic must be physically absent. |
| Body + kk/ru display | **Geologica** (full local TTF) | All UI and all Cyrillic, including Ә Ғ Қ Ң Ө Ұ Ү Һ І. Do not load it through a Google subset. |
| Figures | **JetBrains Mono** | Tabular money, tonnes, clocks, IDs — never Kazakh words. |

Never Inter, Geist, Roboto, Space Grotesk, Plus Jakarta, or IBM Plex / Source Serif (those were attempt 1).

Kazakh and Russian copy must be a single face in each word. Unbounded is missing ӘҒҚҢӨҰҮҺ; putting it first in a stack makes those letters fall back to a random font.

### Imagery

Canonical files in `public/media/`:

- `hero-harvest-dusk.png` — overview / first viewport
- `grain-kernel-macro.png` — tactile inset, texture
- `empty-silo-light.png` — empty states and loaders

Rules:

- Real photographs of *this* world only. No happy farmers, no isometric 3D, no abstract mesh gradients, no Unsplash random office.
- Every meaningful empty and loading state uses imagery, not a Lucide shrug icon.
- `alt` text is localized. Decorative textures use empty alt.
- Prefer `next/image` with `fill` + `object-cover`. Hero may `priority`.

### Motion (2026, not circus)

Use CSS. No `transition: all`. No bounce, elastic, or springy overshoot. Honor `prefers-reduced-motion: reduce` (instant or opacity-only).

| Moment | Motion |
|---|---|
| First paint | Staggered `rise` (opacity + 14px translateY, `cubic-bezier(0.16, 1, 0.3, 1)`, 700–900ms) |
| Hero photo | Slow kenburns 28s, scale 1 → 1.08, `forwards` |
| Buttons | `ease-out` color/transform 150–180ms; `:active` scale `0.98` |
| Live dot | Soft opacity pulse |
| Loaders | Layout-true skeletons + harvest shimmer, never a centered spinner as the only state |
| Locale switch | Existing router refresh; keep controls feeling instant (`useTransition` pending opacity) |

One orchestrated entrance per view. Do not sprinkle hover-float on every card.

## UX that reads as intelligent

A $100k+ product is *stateful*:

1. **Loading** — `ScreenLoader` / `src/app/loading.tsx` must match the destination layout (hero bones, metric bones). Copy explains what is assembling.
2. **Empty** — photograph + one sentence + one action. Never “No data”.
3. **Live** — as-of clock, connected pulse, Devnet is a venue status not a green marketing banner.
4. **Error** — what broke, what to do. No apology theater.
5. **Locale** — ҚАЗ / РУС / ENG as a venue switcher, not an afterthought. Default locale is Kazakh.

Operate-mode pages (tables, desks, registries) stay dense and scannable. Wow lives in chrome, hero, empty, loading, and type — not in decorating every admin row.

## Layout rules

- New chrome is full-bleed. Do not wrap the whole app in `max-w-7xl` like a blog.
- Guest overview (`/`) is `data-surface="flush"` cinematic. Other routes sit in the `surface-main` well.
- Do not restyle by adding a parallel `/ui-v2` tree. This branch *is* the product surface.
- Reuse `src/components/ui/*` (shadcn / Base UI). Skin via tokens, don't fork a second button system.
- Compound components over boolean prop soup.

## Banned generic-AI tells

- Cream background + terracotta + “elegant” serif
- Near-black + acid green crypto
- Hairline newspaper dashboard with 01 / 02 / 03 decoration
- Gradient orbs, glassmorphism everywhere, rounded-3xl card grids
- Big number + tiny label + three metric cards as the *hero* (metrics can support; they are not the thesis)
- Fake 3D, purple glow, Inter on white

## How to work

1. Read this skill before writing UI.
2. Read `.agents/skills/frontend-design/SKILL.md` for anti-slop taste, then **obey this brief's locked direction** (do not pick a new aesthetic).
3. For motion details, `.agents/skills/emil-design-eng/SKILL.md` and `.agents/skills/animate/SKILL.md`.
4. For a11y / UX audit, `.agents/skills/web-design-guidelines/SKILL.md` (fetch the live guidelines).
5. For a polish pass, `.agents/skills/impeccable/SKILL.md` with this brief pinned.
6. Verify in the browser: click, locale switch, empty/loading, desktop and a mobile width. A screenshot is not verification.

## Copy voice

Named by what the operator controls. Specific, sentence case, no filler. Kazakh and Russian are first-class, not calques of English UI chrome. Keep instrument IDs (`WHEAT-2027`) intact.
