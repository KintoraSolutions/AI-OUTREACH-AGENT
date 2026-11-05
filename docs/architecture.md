# Architecture

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15, App Router, React 19 | Server Components by default; `"use client"` is the exception |
| Language | TypeScript, strict, `noUncheckedIndexedAccess` | Indexing an array gives `T \| undefined`; handle it |
| Styling | Tailwind v4 (CSS-first) over Fluent 2 tokens | See [design-system.md](design-system.md) |
| Database | PostgreSQL via Prisma 6 | 29 models; `embedded-postgres` locally, managed Postgres in production |
| Auth | Auth.js v5 | Google OAuth, plus a development-only credentials provider |
| Background jobs | Inngest | Mandatory in production; an in-process runner is used in development |
| AI | Anthropic SDK | One forced tool call per draft |
| Tests | Vitest | 38 test files |

## The one-paragraph version

A campaign describes *where to look* (categories, city, radius, lead cap,
keyword filters). Running it queues a durable job that discovers clinics
through the Google Places API, crawls each clinic's public website, turns what
it read into neutral **findings**, and scores those findings with a pure
function. A human then triggers drafting; the model is given only citable
evidence and must map every factual sentence to a finding. A deterministic
guard re-checks that mapping and blocks the draft if it fails. An admin
reviews and approves, which creates a Gmail draft in the operator's own
account. The operator presses send, in Gmail, themselves.

## Module map

```
src/
├── app/
│   ├── page.tsx              public landing (redirects signed-in users)
│   ├── (auth)/signin/        sign-in
│   ├── (dashboard)/          the product; guarded by requireOrgContext()
│   ├── onboarding/           first-run: identity, company, voice, AI profile
│   └── api/inngest/          durable job endpoint (outside the auth matcher)
├── components/
│   ├── app/                  product UI (the signed-in surface)
│   ├── marketing/            the public landing page, dark-locked
│   ├── brand/                the Katalyst mark
│   └── ui/                   shadcn primitives
├── lib/
│   ├── research/             discovery, crawling, extraction, the pipeline
│   ├── scoring/              rules, the engine, audit findings, rescore
│   ├── ai/                   prompts, strategy, drafting, the guard, presets
│   ├── integrations/         Google OAuth, Gmail drafts, Calendar
│   ├── auth/                 RBAC, org context, the sign-in policy
│   ├── campaigns/            cost estimation, readiness checks
│   ├── drafts/ leads/        domain helpers for the two main surfaces
│   ├── retention/            scheduled purge
│   ├── help/ tutorial/       in-app explanatory content
│   └── env.ts                validated environment, fails loudly at boot
├── inngest/                  client and durable function definitions
└── middleware.ts             redirects unauthenticated users to /signin
```

## Data flow

```
Campaign (categories, city, radius, caps, keywords)
    │
    ▼  runCampaign()  →  ResearchJob QUEUED  →  Inngest
Discovery            Google Places text search, over-fetches 3×,
                     filters and de-duplicates, keeps the surplus as reserves
    │
    ▼
Enrichment           robots-respecting crawl: contacts, booking method,
                     services, locations, socials; optional PageSpeed
    │
    ▼
buildAuditFindings   observations → neutral findings, each with a category,
                     a confidence level, an evidence string and a source URL
    │
    ▼
scoreClinic          pure: points × confidence multiplier, capped per
                     category, clamped 0–100, full breakdown stored
    │
    ▼  (human triggers)
planDraft            model-free. No citable evidence ⇒ BLOCKED, no model call
    │
    ▼
Anthropic            forced `compose_outreach_email` tool call requiring a
                     claim → evidence mapping for every factual statement
    │
    ▼
validateDraft        deterministic guard; blocks rather than warns
    │
    ▼  (admin approves)
Gmail draft          created in the operator's own mailbox. Nothing is sent.
```

### Scoring, concretely

Five finding categories, each with a cap: Website 30, Custom software 25,
Phone operations 25, Contactability 10, Business fit 10. Roughly 34 named
rules. A finding's contribution is `round(rule.points × confidenceMultiplier)`,
where the multipliers are Verified 1.0, Strong inference 0.75, Weak inference
0.5, Unknown 0. Evidence below a rule's `minConfidence` contributes nothing
and is recorded as *rejected* in the breakdown. Every weight, cap, multiplier
and threshold is an org-level override.

The engine is a pure function, which is what makes the public landing page
able to render a worked example by *running* it rather than describing it —
see `src/components/marketing/sample-lead.ts`.

## Invariants (do not break these)

These are load-bearing. Several have tests; all of them have a reason.

1. **The app never sends email.** Only the `gmail.compose` scope is requested.
   There is no send endpoint, no SMTP, no sequencer. Approval creates a
   *draft*. Creating a Gmail draft deliberately does **not** advance a lead to
   `CONTACTED`.
2. **`validateDraft` is not bypassable.** It blocks a draft whose claim cites
   missing, insufficient or dismissed evidence, and also blocks PHI in
   provider-to-provider outreach, unverified loss/revenue claims, references to
   how data was gathered, impersonation, and unfilled placeholders.
3. **Use-case and preset guardrails may only ADD restrictions.** They never
   relax the system prompt's rules.
4. **Org-authored text is data, never instructions.** The system prompt frames
   org configuration explicitly so a value typed into Settings cannot act as a
   prompt injection.
5. **No fake fallbacks.** If a provider is not configured, the app says so.
   `NullDiscoveryProvider` throws rather than inventing leads, and the job
   runner refuses in production rather than silently degrading to in-process.
6. **Every query is org-scoped.** Multi-tenancy is enforced per query, not by
   convention.
7. **The audit log is append-only.** Manual changes to a finding or a score
   require a written reason and are never updated or deleted.
8. **The pop-up-safe `window.open` in `draft-panel.tsx`'s `approve()` must stay
   synchronous.** Moving it into a promise callback or behind an `await` makes
   browsers block the Gmail tab.

## Multi-tenancy and roles

`Organization` → `Membership` → `User`, with four roles: `VIEWER < MEMBER <
ADMIN < OWNER`. `requireOrgContext()` in the dashboard layout is the real
gate; `middleware.ts` is defence in depth and its matcher does not cover every
route under `(dashboard)`.

Sign-in is closed by default in production: with `AUTH_ALLOWED_EMAILS` set,
only listed addresses pass; unset, only existing users can sign in. See
`src/lib/auth/sign-in-policy.ts`.

## Jobs

`chooseRunner()` returns the Inngest runner in production and refuses if the
keys are missing. Durable steps are memoized, so a redelivered event does not
redo completed work, and one unreachable website does not fail a run.
`/api/inngest` sits outside the auth matcher and verifies requests with the
signing key.
