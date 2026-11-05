# Outreach Agent — UI Design Spec (Fluent)

**Direction:** A Microsoft Fluent 2 workspace — light-first, fully themed for dark, and accessible by construction.
**Goal:** Make the product feel like software a clinic operations person already knows how to use, and fix the two real problems with the previous UI: it was *visually flat* (everything on one plane, no hierarchy) and it *never explained itself* (no help, no tooltips, no next step).

This replaces the previous **"Clinical Terminal"** direction (committed dark console, warm charcoal, electric mint, Fira Sans/Fira Code). That system's blanket ban on "generic SaaS blue" no longer applies: Fluent communication blue is now the deliberate brand color. The bans on glassmorphism and Apple mimicry still stand — there is no `backdrop-filter` anywhere.

---

## 1. Design Principles

1. **Elevation carries hierarchy.** The old theme had one shadow (`0 1px 2px`) on a dark ground, so a metric tile, a chart panel and an empty state were visually identical rectangles. Fluent's shadow ramp (2 / 4 / 8 / 16 / 28 / 64) now says what leads: `raised` for the one thing that matters on a page, `rest` for ordinary content, `flat` for dense grids that should recede.
2. **Square-ish, not soft.** 4px is the default radius. Fluent reads as precise and utilitarian; soft 10–14px pills read as consumer.
3. **The type ramp is the layout system.** There is a real scale (`caption2` → `largeTitle`). Hardcoded arbitrary sizes are a bug, not a shortcut.
4. **Accessible by construction, not by audit.** Fixes live in the primitive so every consumer inherits them: the dual focus ring, `aria-invalid` styling, `role="status"` on the spinner, 12px table headers.
5. **Never color alone.** Every status pairs a hue with an icon, a word, or a shape.
6. **Honest states.** A spinner means work is happening. Nothing animates as if it were tracking progress the server does not actually report.

---

## 2. Foundations

All tokens live in `src/app/globals.css`, in four ordered sections: **(1)** Fluent primitives per theme, **(2)** compatibility aliases, **(3)** `@theme` exposure to Tailwind, **(4)** base and utilities.

### Theming
`:root` is light, `.dark` is dark. The variant is `@custom-variant dark (&:where(.dark, .dark *))`.

> Previously this was `@custom-variant dark (&)`, which forced **every** `dark:` utility on unconditionally in order to fake a committed dark theme. That had to be undone before a light theme could exist at all.

Preference is stored in `localStorage` under `oa-theme` (`light` | `dark` | `system`). `src/lib/theme.ts` exports `THEME_BOOT_SCRIPT`, which `src/app/layout.tsx` inlines in `<head>` so the class lands before first paint — no flash, and no `next-themes` dependency. `src/components/ui/theme-toggle.tsx` is the control; on `system` it follows OS changes live.

### Color

| Token family | Purpose |
|---|---|
| `--fl-bg-1 … --fl-bg-6` | Surfaces. `bg-1` cards/inputs/menus, `bg-3` app canvas, `bg-4` subtle fills |
| `--fl-stroke-1 … 3` | `stroke-1` control borders, `stroke-2` dividers and card edges |
| `--fl-fg-1 … --fl-fg-4` | `fg-1` primary text, `fg-2` secondary, `fg-3` captions and table heads |
| `--fl-brand` | **Solid fill.** White text sits on it |
| `--fl-brand-text` | **Accent text/icons.** Sits on the canvas |
| `--fl-brand-tint` | Selected rows, active nav |
| `--fl-{success,warning,danger,info}-{fg,bg,stroke}` | Status triads |
| `--fl-chart-1 … 5`, `--fl-chart-track` | Categorical data-viz palette |
| `--fl-shadow-2 … 64` | Fluent elevation |

**`--fl-brand` and `--fl-brand-text` are deliberately different tokens.** In dark mode a fill light enough to read as blue (`#479ef5`) is too light to carry white text, so the fill stays `#115ea3` while accent text goes `#479ef5`. Using one token for both guarantees a contrast failure in one theme or the other.

**Compatibility aliases.** Every legacy token name — `--hairline`, `--surface`, `--mint`, `--amber`, `--muted-foreground`, `--faint-foreground`, and the `.glass*` utility classes — still resolves, now pointing at Fluent values. This is why ~48 components re-skinned with zero edits and gained theme switching for free. `--mint` now resolves to brand blue; new code should use `--fl-*` directly.

### Typography — native Microsoft stack, no webfont
```
--font-sans:    "Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", -apple-system, system-ui, …
--font-display: "Segoe UI Variable Display", … (headings; optically sized for large text)
--font-mono:    "Cascadia Mono", "Cascadia Code", Consolas, …
```
These are Microsoft's actual brand faces and are native on Windows — authentic *and* zero font payload. Fira Sans/Fira Code were removed along with `next/font`. Non-Windows clients fall through to the platform UI face, which is what Microsoft's own web properties do.

Ramp (Tailwind utilities): `text-caption2` 10/14 · `caption1` 12/16 · `body1` **14/20, the default** · `body2` 16/22 · `subtitle2` 16/22 semibold · `subtitle1` 20/26 · `title3` 24/32 · `title2` 28/36 · `title1` 32/40 · `large-title` 40/52.

### Shape, elevation, motion
- Radii: `rounded-sm` 2 · `rounded-md` **4, the default** · `rounded-lg` 6 · `rounded-xl` 8.
- Motion: Fluent curves as `--ease-easy`, `--ease-decelerate`, `--ease-accelerate`; 100–250ms. All of it collapses under `prefers-reduced-motion`.
- `tw-animate-css` is installed. Before this, `dialog.tsx` and `dropdown-menu.tsx` shipped `animate-in` / `fade-in-0` classes from `tailwindcss-animate` — **a package that was never a dependency** — so those animations were dead code for the whole life of the project.

### `cn()` is theme-aware — do not bypass it
`src/lib/utils.ts` extends tailwind-merge with the Fluent font sizes. tailwind-merge only knows Tailwind's own `text-xs … text-9xl`, so an unrecognized `text-<word>` falls into its **text-color** group. That was a live bug: `text-caption1` evicted `text-[var(--fl-on-brand)]` from `buttonVariants`, and every small solid button rendered at **2.88:1**. Locked in by `src/lib/utils.test.ts`. Any new `--text-*` token must be added to `FLUENT_FONT_SIZES`.

---

## 3. Application shell

**Suite header** (48px, `app-header.tsx`) — nav-collapse toggle · brand · **global search** (real `<form role="search">`, pushes to `/leads?q=`) · `?` Help · theme toggle · Settings gear · account menu. Previously this bar held only a user chip on the far right and was otherwise empty.

**Navigation** (`nav-rail.tsx` + `sidebar-nav.tsx`) — collapsible 240px ↔ 48px icon rail, persisted to `oa-nav-collapsed`, read in an effect so SSR markup stays stable. Grouped: Dashboard · **Pipeline** (Leads, Campaigns, Jobs) · **Workspace** (Settings) · **Learn** (Tutorial, Help). Active item = brand tint + brand text + the `.fl-selected-indicator` 3px leading bar, with `aria-current="page"`. In rail mode each item keeps an `aria-label` and a tooltip.

**Breadcrumbs** — `buildCrumbs(pathname, overrides?)` in `src/lib/nav/breadcrumbs.ts` is pure. `PageHeader` publishes its title so `/leads/[id]` reads "Dashboard › Leads › Riverside Dental" rather than a cuid. Hidden on `/dashboard`.

**Command bar** — `PageHeader`'s existing `actions` prop renders through it. The signature is unchanged; only the look moved.

The org switcher renders `null` at ≤1 membership instead of showing a permanently disabled control.

---

## 4. Core screens

**Dashboard** — a **getting-started checklist** leads the page: seven real steps derived from live org state via `loadChecklistState()`, with a progress bar, the next action highlighted, and a `HelpTip` per row. It collapses to one line once complete. Then a 4-up KPI row of drill-down links, the analytics strip, and follow-up reminders. The stage breakdown used to render twice (donut *and* bar list); only the donut remains.

**Leads** — four stacked control bars used to push the table below the fold. Pipeline health is now collapsible, saved views merged into the filter row, and **active filters show as removable chips** so you can see and undo what is applied. Sortable headers with real `aria-sort`, a sticky header, and a Comfortable/Compact density toggle that gates the per-row radar.

**Lead detail** — the do-not-contact warning moved from the very bottom of a six-card page to the **top**, as a destructive MessageBar: it is the one fact that should stop you from drafting. The Email draft card is `elevation="raised"` because it is what the page builds toward.

**Draft panel** — generating now keeps the card on screen and shows a skeleton of the draft that is coming, a labelled spinner, and "This usually takes 10-20 seconds". It previously replaced the entire card with one line of muted text. Stages are described in static prose; nothing fakes progress, because a server action cannot stream and the app genuinely does not know which stage it is in.

**Help Centre** (`/help`) — 16 articles from a typed content module (`src/lib/help/content.ts`), client-side search, per-article TOC, prev/next. `HelpTip` deep-links from the UI into the relevant article. `src/lib/help/content.test.ts` asserts every required slug and every cross-reference resolves.

**Tutorial** (`/tutorial`) — a 10-chapter Fluent wizard with a stepper, inline SVG figures, and live state awareness: chapters whose prerequisite is already satisfied are marked done from real data, not from localStorage.

**Settings** — four tabs (Organization · Your AI · Scoring · Integrations and data) replacing nine stacked cards in one scroll. The tab syncs to `?tab=`, and the Google OAuth callback lands on Integrations.

**Onboarding** — a real `Stepper` on both steps, replacing a hardcoded `"Step 2 of 2"` string on step two and no indicator at all on step one.

**Sign in** — was hardcoded dark with inline `style` objects, so it ignored the theme entirely; now a themed card on the app canvas.

---

## 5. Accessibility

Fixed at the primitive so every consumer inherits it:

- **Fluent dual focus ring** — `:focus-visible` draws a 2px dark outer stroke over a 1px light inner stroke (inverted in dark). A single-color ring cannot stay visible on a white card, a blue button *and* a dark canvas; this can.
- **`aria-invalid` now shows.** `Field` always injected `aria-invalid`, but no control styled it, so an invalid field looked identical to a valid one. Inputs, selects and textareas now turn red.
- **Live regions.** The app had **zero** `aria-live` regions. `Spinner` wraps `role="status"`, and result counts, bulk actions and job progress announce.
- **Table headers** were 10.5px uppercase mono at ~3.5:1 — below AA. Now 12px semibold at **6.19:1**.
- **Windows High Contrast** — a `@media (forced-colors: active)` block re-anchors surfaces, the focus ring and the selection indicator to system colors.
- **Native `window.prompt()` is gone** from all three places that used it (reject draft, dismiss/restore finding, clear override), replaced by `ReasonDialog`.
- Measured contrast, both themes, every token pair ≥ 4.5:1: body 15.5:1 light / 14.6:1 dark · secondary 10:1 · captions 6.2:1 · links 5.4:1 / 5.2:1 · white-on-brand 5.4:1 / 6.7:1.

---

## 6. Responsive

Mobile-first. The rail collapses to a hamburger flyout below `md`; the global search and settings gear hide (both are reachable from the account menu); settings tabs scroll horizontally. Verified at 375 / 768 / 1024 / 1440 with `document.scrollWidth === window.innerWidth` on every page — no horizontal scroll anywhere.

---

## 7. Marketing surface (`/`, signed out)

The public landing page is a separate surface with its own rules, but it is not
a separate *language*. Its palette is the app's dark Fluent values lifted
verbatim (`src/components/marketing/theme.ts`) — same `#479ef5` accent, same
surface ramp, same 2/4/6px radii — so the page reads as the product's own front
door rather than a template wrapped around it. The previous landing used a
different blue, 14-20px rounded cards and a fabricated CLI window; the brief on
it was that it felt AI-generated instead of purpose-built.

**Dark-locked.** The landing does not follow the app's theme toggle, so it must
not read `--fl-*` from the document — a visitor whose OS is light would get
light-theme tokens painted on a black page. (That is exactly how the brand mark
used to disappear in the nav.) `SCOPE` re-declares the Fluent variables shared
components consume, pinned to dark, for the landing subtree only.

**Structure, not cards.** The content column is framed by continuous 1px rules
left and right, and sections are separated by a 1px top border. Depth comes from
that frame plus layered surfaces and hard shadows — there is no glow.

**Product visuals are markup, not screenshots.** `product-chrome.tsx` rebuilds
the app's suite header, breadcrumb rail and table chrome from the same tokens.
Markup rather than PNGs because it stays sharp at any density, ships no image
payload, and — the reason that actually matters — can animate: the workflow
section needs that chrome to change state as a clinic advances through it.
Clinic names in these visuals are representative, never the operator's real
pipeline: a public page should not publish who someone is prospecting, nor
attach a low score to a named real business.

**Motion.** `.mk-reveal` is a scroll reveal driven by one `IntersectionObserver`
per subtree (`Reveal`); anything already on screen reveals on mount instead, so
visible content never waits on a callback. `.mk-grow` is deliberately a keyframe
rather than a transition — a transition needs an ancestor state flip to fire,
which would make the hero's product visual depend on hydration. A `<noscript>`
override restores full opacity if JS never runs: content must never be
permanently invisible because an observer did not fire.

> Verifying reveals in the in-app browser needs a **real mouse scroll**.
> Scripted `scrollIntoView` does not drive the compositor there, so observer
> callbacks are not delivered and sections read as blank in screenshots.

---

## 8. Campaign workflow

The campaign is the one flow that spends money, so it is built to be
self-contained: create, inspect, repair, cost and launch without leaving it.

**The sequence is stated, not implied.** `CampaignSteps` runs Criteria →
Discover → Research & score → Resolve issues → Draft emails across
`/campaigns/new`, the campaign page and the review screen. The campaign page
previously ended in a row of equally weighted buttons — Run, Rescore, Draft,
Delete — with nothing to say which came first or whether anything was ready.

**`/campaigns/[id]/review` is the terminal step.** It summarises the lead
counts, the sender and company details, the configuration drafting depends on,
every outstanding issue, and the estimated cost, then launches. Its rule is that
no issue is reported without the control that fixes it: a missing website or
email is repaired inline from the issue list, which writes through
`fix-actions.ts` and revalidates so the counts and the cost settle immediately.
Nobody is sent to the leads database to find one record.

**Readiness mirrors `loadTargets` exactly.** `classifyLead` reproduces the
drafting run's selection rule — scored, effective service other than NONE, not
do-not-contact, manual overrides honoured. If the two drift, the screen promises
a number of drafts the run will not produce, which is the surprise it exists to
prevent, so `readiness.test.ts` pins the rule in both directions.

**Campaign-wide email settings live on the campaign.** Sender name, company name
and the company profile are fed to the model on every draft but were reachable
only through Settings. `CampaignSenderCard` surfaces them on the review screen
and edits them through the real Settings forms in a dialog — one validation
path, one server action — and says plainly that they are shared across
campaigns. `/campaigns/new` warns about the same gaps up front, because finding
out that drafts have no company name *after* researching forty clinics is the
expensive way to learn it.

### Cost estimation

`estimateDraftingCost` prices one model call per draftable lead. Input tokens
are measured from the prompts the run would actually send: `previewDraftPrompt`
builds the real system + user prompt for a sample of leads without touching a
provider, sharing `planDraft` with `generateDraft` so the estimate cannot drift
from the request it is estimating.

Three honesty rules, each covered by a test:

- An unrecognised model yields `priced: false`. Token counts are still shown;
  a dollar figure is not. Guessing a rate is worse than admitting we lack one.
- Sub-cent totals round **up** to `$0.01`. Showing a billable run as `$0.00` is
  the one rounding error worth avoiding.
- Output is costed at a typical fraction of the ceiling, with the full-ceiling
  worst case shown alongside — pricing every draft at `max_tokens` overstates a
  150-word email several times over.

Discovery and website fetching are billed by Google under the operator's own
account, so they are named rather than priced.

### Launch is not send

"Launch" starts drafting. The product never sends, and `CampaignLaunch` says so
at the point of action rather than leaving it to be discovered. It also states
what the run will *not* do: approved drafts are excluded by `loadTargets`, so a
re-run cannot overwrite approved work.

---

## 9. Designer's notes

- **"Dull" was a hierarchy problem, not a palette problem.** The previous theme's colors were fine; what was missing was elevation, a type scale, and any motion. Adding a real shadow ramp and a real ramp of sizes did more than any recoloring.
- **Aliasing the old tokens was the whole strategy.** Re-pointing `--mint`, `--hairline`, `--surface` and friends at Fluent values meant the re-skin landed across ~48 components without touching them, and turned a risky sweeping rewrite into a contained one.
- **Native Segoe beats an approximation of Segoe.** On the target platform it is the real brand face and costs nothing to load.
- **The best accessibility fixes were single-line changes in primitives.** Styling `aria-invalid` in one file fixed every form in the app. The reverse is also true: the `cn()` bug silently degraded every small button in the product from one line in `utils.ts`.
- **The landing had to look like the product to stop looking generic.** The strongest signal that a marketing page is a template is that it shares no vocabulary with the software it sells. Adopting the app's own tokens, geometry and chrome fixed more of the "feels AI-generated" complaint than any amount of new illustration would have.
- **An error message is half a feature.** The campaign screens used to report problems correctly and leave you to go solve them somewhere else. Moving the repair next to the report — one input, in the list, on the same screen — changed more about how the flow feels than any amount of restyling the message would have.
- **Safety survived the redesign.** The drafts-only guarantee is untouched: no send control exists anywhere, the evidence guard is unchanged, and the pop-up-safe synchronous `window.open` in `approve()` was explicitly preserved and commented.
