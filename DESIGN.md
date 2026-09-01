# The Exchange Desk — Design Canon

**Status:** Authoritative design document for the global Commodity Chain platform shell. Read
before any UI, CSS, layout, component, copy or state-design work.
**Companion documents:** `PRODUCT.md` (product authority), `.impeccable/design.json` (machine-readable
token and component seed).

**North star:** *The Exchange Desk.*
**Quality references:** KASE, Addepar, institutional exchange and capital-markets workstations.

---

## 1. What this is

Commodity Chain is an **Operate** surface: a regulated institutional console. It is not a marketing
site, not a farm marketplace, and not a crypto terminal. Convention is the commitment — an operator
should recognise the category instantly and be able to work without being taught.

The product must read as credible for a Kazakhstan exchange operator, an international fund desk,
and a regulator, in Kazakh, Russian and English, at the craft level of the references above.

---

## 2. Design authority and scope boundary

This is the most important rule in this document.

| Layer | Direction | Scope |
| --- | --- | --- |
| **Global Commodity Chain shell** | **The Exchange Desk** | Every platform surface: navigation, markets, protocols, instruments, issuances, registry, clearing, supervision, compliance, audit, admin. |
| **Field to Finance protocol context** | Harvest Capital *(optional, contextual)* | Only inside F2F-specific experiences where a protocol-specific visual treatment is genuinely warranted. |

- **Exchange Desk is global.** It defines the platform.
- **Harvest Capital is Field to Finance-contextual only.** It is one protocol's texture, not the
  platform's identity.
- **Agriculture imagery must never define the global shell**, and must never be applied to Water,
  Music Rights, Gaming Assets or any future protocol. A platform that looks like a grain product
  cannot credibly host a water or music rights protocol.
- `.cursor/skills/harvest-capital-ui/SKILL.md` is scoped to the F2F contextual layer and does not
  override this document or `PRODUCT.md`.

---

## 3. Principles

1. **The job, in a table, with one obvious next action.** Tables, ledgers, documents and workflow
   rows outrank decorative card grids. Metrics support a screen; they are never its thesis.
2. **Calm density.** Institutional information is dense and legible, not sparse and padded.
3. **One accent.** Exchange Navy marks the current action, the current navigation item and focus.
   It does not paint backgrounds, icon tiles or chart decoration.
4. **Status is a word.** Not a rainbow of tiles. Domain enums stay enums; surrounding copy stays
   human.
5. **Flat by default.** Shadow indicates overlapping UI, not panel personality.
6. **Hierarchy is explicit.** Every Market Core screen states which level of the product hierarchy
   it belongs to, and how to move up and down it.
7. **Dual literacy.** Plain stage names for producers; institutional density for funds and
   regulators. The same data, addressed to the reader.
8. **No generic AI aesthetics. No crypto neon.** No gradient orbs, glassmorphism, oversized radii,
   purple glow, decorative icon tiles, or big-number hero card grids.

---

## 4. Visual system

### Colour

| Token | Value | Intent |
| --- | --- | --- |
| Exchange Navy | `#0A4F8C` | The single action colour: primary action, active nav, focus ring |
| Exchange Navy Hover | `#083E6E` | Hover state of the above |
| Rail Ink | `#0B1F33` | Dark navigation rail ground |
| Rail Paper | `#E8EEF4` | Text on the rail |
| Rail Muted | `#8A9AAB` | Secondary rail text |
| Work Ground | `#F4F6F8` | Light operational work surface |
| Surface | `#FFFFFF` | Panels and tables |
| Ink | `#121820` | Primary text |
| Ink Muted | `#5A6572` | Secondary text |
| Rule | `#D8DEE6` | Hairline borders |
| Settled | `#1A5C40` | Settled / verified |
| Warning | `#8A6A12` | Attention |
| Exception | `#B42318` | Breach / destructive |
| Pending | `#4A5C72` | Awaiting, not-yet, not-claimed |

Restraint is the rule. Colour carries meaning; it is not decoration.

### Typography

**Golos Text** as the single family, because the quality bar is a Kazakhstan exchange plus an
international fund desk and the product must set **Kazakh, Russian and English** without a
display/body theatre pairing. Kazakh requires Ә Ғ Қ Ң Ө Ұ Ү Һ І; a face that lacks them is
disqualified regardless of how it looks in Latin.

Roles: Display (page titles only) · Headline (section titles) · Title (table groups, dialogs) ·
Body (default UI and table cells) · Label (column headers, captions, chips). Figures are tabular
for money, tonnes, clocks and identifiers.

### Space, border, radius, elevation

- Radii **4–6px**. Never pill-shaped panels, never `rounded-3xl`.
- Hairline `1px` rules in Rule colour. Borders separate; shadows do not.
- Shadow is reserved for genuinely overlapping UI (dropdowns, dialogs, mobile rail overlay). A
  single `overlay` shadow token exists; panels at rest are flat.
- Motion: `cubic-bezier(0.4, 0, 0.2, 1)`, 150–250ms, state changes only. No page-load
  choreography, no bounce or elastic overshoot. Never `transition: all`. Honour
  `prefers-reduced-motion: reduce`.

---

## 5. Information design

Table and ledger first. A screen answers, in order: *where am I in the hierarchy*, *what is the
state of this thing*, *what is the evidence*, *what can I do next*.

- Group by real structure (protocol, family, lifecycle state), never by visual convenience.
- Show identifiers verbatim (`WHEAT-2027`, `F2F-V1.1`, `ISS-001`). They are the operator's handles.
- Prefer one wide honest table to several decorative panels.
- Empty groups are omitted or stated as empty. Never populate a group to make a layout balance.

---

## 6. Responsive behaviour

Breakpoints: mobile `768px`, tablet `1024px`, desktop `1280px`.

- Desktop: persistent dark navigation rail plus work surface.
- Tablet: rail collapses to an overlay; the work surface keeps its density.
- Mobile: rail becomes a sheet. Wide tables scroll horizontally **inside their own container** —
  the page body never scrolls sideways. Where a table cannot compress honestly, offer a row-per-record
  ledger rather than hiding columns silently.

---

## 7. Accessibility

- WCAG 2.2 AA contrast for text and meaningful UI. Exchange Navy on white and Rail Paper on Rail
  Ink both clear AA; verify any new pairing rather than assuming.
- Visible focus on every interactive element: `2px` Exchange Navy outline, `2px` offset. Never
  remove focus rings.
- Full keyboard operability, in DOM order that matches visual order.
- Status is never colour alone — always an accompanying word.
- Breadcrumbs use a real `<nav aria-label>` with an ordered list.
- Decorative imagery uses empty `alt`; meaningful imagery uses **localized** alt text.

---

## 8. Language parity

Kazakh (`kk`), Russian (`ru`) and English (`en`) are equal. Default locale is Kazakh.

- Every new string ships in `messages/en.json`, `messages/ru.json` and `messages/kk.json`
  **together**, at identical key set and ordering.
- English falls back silently when a key is missing, so a missing translation is invisible in
  review — parity is enforced by test, not by inspection.
- Canonical internal English records (for example a protocol version's governance note) are never
  rendered directly to a user. The presentation layer selects a localized message and **fails
  closed** to a localized "unavailable" string.
- Kazakh and Russian are first-class copy, not calques of English UI chrome.

---

## 9. State design

Every surface must define all five states.

| State | Requirement |
| --- | --- |
| **Loading** | Layout-true skeleton matching the destination, not a centred spinner as the only state. |
| **Empty** | One sentence saying what is absent and why, plus the next action if one exists. Never "No data". Never invented rows. |
| **Error** | What broke and what to do. Localized in all three languages. No apology theatre. |
| **Unavailable / not claimed** | A distinct, honest state. A protocol with no version says so. A date that has not been established renders as *not claimed*, never as a blank or a guess. |
| **Live** | As-of time and venue status stated plainly. Devnet is a venue status, not a marketing badge. |

---

## 10. Transition boundary — honest current state

The repository has **not** yet been restyled to The Exchange Desk. Current global CSS in
`src/app/globals.css` still carries the previous Harvest Capital tokens and typography.

This document defines the **target and the authority**, so that new work moves toward it rather
than deepening the old direction. It does not retroactively describe the shipped surface.

Until a dedicated restyle phase lands:

- New work reuses existing components and does not deepen agriculture-specific global chrome.
- No parallel UI tree (`/ui-v2` or similar) may be created; the shell is restyled in place when
  that work is scheduled.
- Do not perform a broad visual redesign as a side effect of a feature PR.
