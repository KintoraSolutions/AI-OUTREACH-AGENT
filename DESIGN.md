# Outreach Agent — UI Design Spec (Clinical Terminal)

**Direction:** Dark operator command-center for lead research + outreach.
**Goal:** Make the workspace feel like serious operations software — a console an analyst lives in for hours — and fix the two real problems with the prior UI: it was *hard to read* and it looked *generically AI-generated*.

This redesign deliberately **rejects** the three tells that read as machine-made (per the `bencium-innovative-ux-designer`, `ui-ux-pro-max`, and `frontend-design` rule sets): **glassmorphism, Apple mimicry, and generic SaaS blue**. There is no `backdrop-filter`, no system-font stack, and no `#3B82F6`/`#0A84FF` anywhere in the system.

---

## 1. Design Principles

1. **A console, not a card gallery.** One committed dark canvas with a faint console grid. Panels are *solid* surfaces separated by hairlines and elevation, not floating frosted glass.
2. **Data glows; chrome recedes.** A single electric-mint signal marks live figures, the primary action, and the active location. Everything structural is neutral graphite. Your eye goes to the numbers.
3. **Numbers are monospace.** Every metric, score, count, and column of figures is set in Fira Code with tabular figures — the "readout" look, and it makes data genuinely scannable.
4. **Legibility is the whole point.** Text on the canvas and on panels clears **WCAG AAA** (measured: body 17:1, titles ≥ 15:1, muted 7.7:1). High contrast *is* the aesthetic here, not a compromise against it.
5. **Committed dark.** No light mode, no OS toggle — an operations console is always dark. This is a deliberate, coherent choice, not a default.

---

## 2. Foundations

### Color (tokens in `globals.css`)
| Token | Value | Use |
|---|---|---|
| `--canvas` | `#0E1116` | App background (warm near-black) + faint grid |
| `--surface` | `#151A21` | Cards, panels |
| `--surface-2` | `#1A2029` | Raised: dialogs, popovers, menus |
| `--surface-3` | `#202833` | Controls, inputs, bar tracks, hovers |
| `--hairline` / `--hairline-strong` | `rgba(255,255,255,.08 / .14)` | Dividers, borders |
| `--foreground` | `#F2F4F5` | Primary text (~17:1) |
| `--muted-foreground` | `#9AA7B3` | Secondary text (~7.7:1) |
| `--faint-foreground` | `#69747F` | Eyebrows, table heads, captions |
| **`--mint`** | **`#3DDC97`** | Primary / interactive / positive / live data |
| `--amber` | `#FFB020` | Warning / attention |
| `--red` | `#FF6161` | Danger / errors |
| `--cyan` | `#5CC8E8` | Info / secondary data |

Signal accents are used at their bright variant for text and with a `*-dim` (≈13% alpha) fill + `color-mix` border for badges/alerts. The primary button fills mint with **dark ink** (`#052018`) for maximum contrast.

Depth = a **faint console grid** (two 34px line gradients) + soft mint/cyan corner washes, `background-attachment: fixed`. No aurora blobs.

### Typography — Fira Sans + Fira Code (self-hosted via `next/font`)
- **Fira Sans** (UI/display): humanist, characterful, and *not* Inter/Roboto/system — weights 300–700.
- **Fira Code** (data/labels): all numerics, table heads, badges, eyebrows, and the wordmark. Tabular figures via `.stat`.
- Scale: Page title 24–27 / semibold / −0.02em · Card title 15 / semibold · Body 15 · Metric value 32 mono · Hero score 44 mono mint · Micro-label 10.5 mono uppercase +0.1em tracking.

### Shape, elevation, motion
- Radii: controls/cards 8–10px, dialogs 14px, badges 5px. Tight and precise — no soft 20px+ pills.
- Elevation = solid surface + hairline + shadow (`--elev-1/2`). No blur, ever.
- Motion: 150ms ease-out. Buttons `active:scale-[.98]`; tiles lift 2px and their top edge brightens to mint on hover. All motion respects `prefers-reduced-motion`.

### Terminal signatures (the memorable details)
- **`.mono-label`** — uppercase Fira Code micro-caps for every metric caption, table head, and role tag.
- **`.stat`** — tabular mono for every figure; the hero lead-score glows (`text-shadow` mint).
- **Prompt marker** — a small glowing mint bar precedes each page title, like a terminal cursor.
- **Wordmark** — `Outreach_Agent` in mono caps with a mint underscore.
- **Live-edge tiles** — KPI tiles carry a mint hairline on top that ignites on hover.
- **Glowing bars** — every progress/distribution bar is mint with a soft outer glow on a graphite track.

---

## 3. Core Screens

**Sign in** — Centered, ≤ 400px. Mono wordmark + mint-glow shield, a `--surface-2` panel (14px), `Continue with Google` as the secondary control, dev-login below a hairline divider (development only). Compliance note beneath.

**Dashboard** — Prompt-marked header + `New lead`. A 4-up grid of live-edge KPI tiles (mono values, mint icon chips). Below: category / stage / service-mix / score-distribution panels using glowing mint bars with mono counts, then a follow-up reminders list with mono `OVERDUE` tags. Empty state: mint-lit icon panel with New-lead / Import-CSV actions.

**Leads** — Toolbar (search, filters, saved views, bulk actions, CSV). Dense table: mono uppercase heads, hairline rows, row hover → `--muted`, selected → mint-dim. Score cell is mono; do-not-contact / stage are badges. States: skeleton rows (loading), mint-lit empty panel, inline error alert.

**Lead detail** — Two-column. Left: identity, contact, pipeline stage control, activity. Right: **Score card** — a 44px mint glowing readout `/ 100`, service + confidence badges, per-category glowing bars with mono `subtotal/cap`, transparent rule-by-rule findings. Draft panel: version, `Create Gmail draft` (approved-only), states for generating / hallucination-blocked / none.

**Draft review** — Sheet (`--surface-2`, 14px) over a dimmed canvas (solid, no frost). Subject + body in a readable measure, edit → approve → create-draft. Guardrail copy stays visible; no send affordance exists anywhere.

**Campaigns** — Card grid of campaigns with status badges; `New campaign` form (region/services/limits) with inline validation. Detail: run history + per-lead outcomes.

**Jobs** — Table of pipeline runs with mono timestamps and status badges (queued/running/paused/failed/complete); pause/resume controls; live progress bar. Empty + error states.

**Settings** — Sectioned panels: scoring weights, retention (config + dry-run/purge with clear destructive styling and audit trail), integrations (Google connect/revoke), org/members. Each control labeled; async actions show pending state.

---

## 4. Components
- **Button** — default mint+dark-ink with signal glow; `outline` = `--surface-3` control; `secondary`/`ghost` neutral; `destructive` red. 8px radius, semibold, `active:scale`, cursor-pointer, visible focus ring.
- **Input / Select / Textarea** — `--surface-3` fill, hairline border → mint on focus, 8px, 15–16px text (no iOS zoom), faint placeholder.
- **Badge** — mono uppercase micro-cap, 5px, dim-fill + `color-mix` border per tone.
- **Card / Alert / Dialog / Dropdown / Table** — all re-skinned to solid surfaces + hairlines; dialog overlay is a solid dim (no blur).

---

## 5. Accessibility
- **Contrast** (measured on the built app): body 17.1:1, page/section titles 15.8:1, muted 7.7:1 — all **AAA**. Signal-on-surface text uses the bright accent variants for ≥ 4.5:1.
- **Color is never the only signal** — badges and status pair color with a text label; the score pairs the mint number with `/ 100` and category bars.
- **Keyboard** — visible 2px mint focus ring on every interactive element; skip-to-content link; Radix dialogs/menus trap and restore focus; Escape + click-away close.
- **Targets** — controls ≥ 40px high; nav and menu items generously padded.
- **Motion** — `prefers-reduced-motion` collapses all transitions/animations.
- **Semantics** — labeled inputs, `aria-label` on icon buttons, `aria-current` on active nav, `role="alert"` on alerts, mono heads remain real `<th>`.

---

## 6. Responsive
Mobile-first. Sidebar collapses to a hamburger → `--surface-2` sheet; KPI grid 1→2→4 columns; tables scroll inside an `overflow-x-auto` container (page body never scrolls sideways); header stays sticky. Verified at 375 / 768 / 1024 / 1440.

---

## 7. Designer's Notes

- **Why it stopped looking AI-generated.** The prior UI hit all three "machine-made" tells at once — frosted glass, Apple system font + system blue, evenly-gray neutrality. Killing all three and committing to one specific idea (an operator console) is what makes it read as *designed*. Distinctiveness came from commitment, not decoration.
- **Dark + mono + one signal = the whole identity.** Fira Code on every number and a single electric-mint accent do more for "this is a real tool" than any amount of gradient or shadow. Restraint is the move: mint appears only on data, the primary action, and the active location.
- **High contrast was the readability fix.** The old complaint ("hard to read, too neutral") was a contrast problem. A near-black canvas with `#F2F4F5` text lands at 17:1 — the theme is legible *because* it's bold, not in spite of it.
- **Solid over glass on purpose.** Frosted panels look premium in a screenshot and fight text in practice. Solid `--surface` tiers give the same depth hierarchy with none of the legibility tax — and they're honest about being software, not glass.
- **Safety survived the reskin.** The drafts-only guarantee is untouched: the flow still terminates at "Create Gmail draft" behind a review sheet, and no send control exists in the UI.
