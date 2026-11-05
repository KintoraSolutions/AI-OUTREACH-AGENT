# Testing

```bash
npm test          # one pass
npm run test:watch
npm test -- src/lib/scoring     # a subset, by path
```

Vitest, configured in `vitest.config.mts`. Tests live beside the code they
cover as `*.test.ts`, not in a parallel tree, so a module and its tests move
together. There are 38 test files.

## One test always fails locally

```
src/lib/ai/draft.test.ts
  > "reports unconfigured without a key and throws rather than returning fake output"
```

It asserts `new AnthropicAiProvider().isConfigured()` is `false`. On any
machine with a real `ANTHROPIC_API_KEY` in `.env`, it is `true`, so the test
fails. **This is environmental, not a regression.** A green run on a developer
machine is therefore `N-1 passed, 1 failed`; CI without the key is fully green.

If you are changing drafting code, check the failure is still only this one
before assuming you broke something.

## What is covered, and why those things

The suite concentrates on the parts where being wrong is expensive and where
the logic is pure enough to test honestly.

| Area | What the tests pin down |
|---|---|
| `lib/scoring` | The engine is a pure function: the same findings and config always produce the same score. Rules, multipliers, caps, rejection below `minConfidence`, and the recommendation thresholds. |
| `lib/ai` | The guard. That unsupported claims, dismissed findings, PHI, loss claims, impersonation and placeholders **block** rather than warn; that preset and use-case guardrails only ever add restrictions; that org text is treated as data. |
| `lib/auth` | `decideSignIn`: allowlist, existing-users-only in production, unrestricted in development. |
| `lib/campaigns` | Cost estimation and readiness classification, including sub-cent rounding. |
| `lib/integrations` | The Gmail guard: do-not-contact, suppression, unsubscribes, and the same mailbox reached through two different leads. |
| `lib/research` | Failure classification, so an operator sees a summary rather than a stack trace. |
| `lib/db` | Encoding folding, so a WIN1252 database cannot silently drop a lead. |
| `components/marketing` | That the public page's worked example is derived from the real engine. |

## The marketing sample test

`src/components/marketing/sample-lead.test.ts` is unusual and worth
understanding before you change a scoring rule.

The public landing page prints a worked scoring example: a clinic, its
findings, its category subtotals and its overall score. That example used to be
hand-written, and a review found it disagreed with the engine in four separate
ways at once — findings shown at a confidence the pipeline never assigns, a
"rejected" row for a rule that cannot be rejected, a recommendation that did
not follow from the subtotals beside it, and two subtotals the listed
observations made impossible.

So the page no longer describes the engine; it **runs** it.
`sample-lead.ts` calls `buildAuditFindings` and then `scoreClinic` against the
default config, and the figures render whatever comes back. The test asserts
the derivation is real, that subtotals sum to the overall, that no subtotal
exceeds its cap, and — deliberately — that the published number is still
**43, Combined, Low confidence**.

That last assertion will fail if you change a rule's points, its minimum
confidence, a multiplier or a cap. That is the point: the number is published
on a public page, so it must not move silently. Update the assertion
deliberately, as part of the change.

## Writing tests here

- Prefer testing a pure function over mounting a component. Most of the risk in
  this codebase lives in `lib/`, and it is nearly all pure.
- Do not mock the scoring engine or the draft guard in order to make something
  else easier to test. They are the safety boundary; a test that mocks them
  proves nothing about the behaviour that matters.
- Test the **blocked** path as carefully as the happy path. Every guard rule
  should have a test that proves it blocks, not merely that it exists.
- Seed data must stay clearly marked as test data. `db:seed` creates records
  that are recognisable as synthetic on sight.

## Other checks

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint
npm run build:verify  # production build, safe while dev is running
npm run verify:db     # end-to-end against a real Postgres
npm run smoke:ai      # one live Anthropic call
```

`verify:db` applies the migration, seeds, runs a small controlled campaign
through the real repository, and checks that clinics, sources, timestamps,
findings, errors and final status are all stored and that duplicates are
prevented. It is the closest thing here to an integration test, and it needs a
real database.

> **`verify:db` destroys the database it runs against.** It starts Postgres
> with `fresh: true`, which deletes the entire data directory rather than
> resetting the schema. It used to default to `./.local-postgres`, the same
> directory `npm run db:local` uses, so running it wiped the developer's
> working database: orgs, leads, drafts, approvals, all of it, with no prompt
> and before the first line of output. That has happened, and cost a real
> workspace.
>
> It now uses `./.local-postgres-verify` instead, and `startLocalPostgres`
> refuses `fresh: true` against any path ending in `.local-postgres`. Stop the
> `db:local` server before running it, since both want port 5432.

A full pre-merge pass is: `typecheck`, `lint`, `test`, `build:verify`.

## Operational procedures (credential-dependent)

These exercise real external providers. Where credentials are not configured, the corresponding feature reports as unavailable and the test is **PENDING** — never faked.

| Procedure | How to run | Status without credentials |
| --- | --- | --- |
| **Real Anthropic drafting** | Set `ANTHROPIC_API_KEY`, then `npm run smoke:ai`. Drafts one email through the real API against a throwaway DB and asserts structured output, evidence mapping, the guard, and persistence. | PENDING (reports the config error path) |
| **Google OAuth + Gmail draft** | Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`; register the redirect URIs (below); add your address as a Test user. Connect from Settings → Integrations, approve an email draft on a lead whose recipient is a developer-controlled address, then "Create Gmail draft". Confirm a **draft** appears in Gmail; **do not send it**. No send API is ever called. | PENDING (guarded path is covered against real Postgres with a fake Google transport in `verify:db`) |
| **Inngest durable jobs** | Locally, run `npx inngest-cli@latest dev` alongside `npm run dev` (auto-discovers `/api/inngest`); run a campaign or bulk draft and watch it in the Inngest dev dashboard. In production set `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`. | Local dev uses the in-process runner automatically; production refuses to run jobs until configured |
| **Google Places discovery** | Set `GOOGLE_PLACES_API_KEY`, create a campaign with categories + geography, and run it. Discovery uses the Places Text Search API (compliant, no scraping). | PENDING (discovery reported unavailable; manual entry + CSV still work) |
| **Authenticated browser preview** | `npm run db:local` (a real local Postgres), `npm run db:migrate`, `npm run db:seed`, `npm run dev`; sign in with the dev login (`AUTH_DEV_LOGIN=true`, seeded user `founder@example-clinic-sales.test`) and exercise the dashboard, leads, settings, and retention flows. | Works locally with the dev login; Google sign-in is PENDING until OAuth is configured |

Redirect URIs to register in Google Cloud: `{NEXTAUTH_URL}/api/auth/callback/google` (sign-in) and `{NEXTAUTH_URL}/api/integrations/google/callback` (integrations).
