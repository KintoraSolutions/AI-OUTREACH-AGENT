# Katalyst

Outbound lead research and outreach for healthcare clinics.

Katalyst discovers clinics through the Google Places API, crawls their public
websites into evidence **findings**, scores each clinic with a deterministic
rule engine, and drafts an email in which every factual sentence maps to a
finding with a source URL. A draft whose claim cannot be supported is blocked
rather than sent out for review. When an admin approves one, it is created as a
**draft in the operator's own Gmail**.

**It never sends email.** Only the `gmail.compose` scope is requested; there is
no send endpoint anywhere in the codebase.

Who it is for: companies and agencies selling services to healthcare clinics,
and providers introducing their practice to other providers who may refer
patients to them.

## Quick start

```bash
cp .env.example .env     # set DATABASE_URL, DIRECT_URL, AUTH_SECRET
npm install
npm run db:local         # real local Postgres, no Docker, own terminal
npm run db:migrate
npm run db:seed
npm run dev
```

Sign in with the seeded development user `founder@example-clinic-sales.test`.
Full instructions, including the gotchas worth knowing before your first
build, are in [docs/development.md](docs/development.md).

> **Do not run `npm run build` while `npm run dev` is running.** They share
> `.next`, and the dev server will start serving 404s for every stylesheet.
> Use `npm run build:verify`.

## Documentation

Everything lives in [`docs/`](docs/README.md).

| | |
|---|---|
| [development.md](docs/development.md) | Setup, commands, conventions, gotchas |
| [architecture.md](docs/architecture.md) | Modules, data flow, and the invariants |
| [features.md](docs/features.md) | What each part of the product does, in detail |
| [testing.md](docs/testing.md) | How testing works and what is covered |
| [deployment.md](docs/deployment.md) | Going from localhost to a public URL |
| [design-system.md](docs/design-system.md) | Fluent tokens, components, app shell |
| [planning/roadmap.md](docs/planning/roadmap.md) | Current state and open work |
| [decisions/](docs/decisions/) | Why things are the way they are |

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind v4 over
Fluent 2 tokens · PostgreSQL via Prisma 6 · Auth.js v5 · Inngest · Anthropic ·
Vitest.

## Repository layout

```
src/            application code
  app/          routes: public landing, (auth), (dashboard), api
  components/   app/ (product) · marketing/ (public) · ui/ · brand/
  lib/          research · scoring · ai · integrations · auth · campaigns · …
  inngest/      durable background functions
prisma/         schema, migrations, seed
scripts/        local Postgres, isolated build, verification smoke tests
docs/           all documentation
```

## Commands

| | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build:verify` | Production build into `.next-verify`, safe alongside `dev` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run db:local` | Start the embedded Postgres |
| `npm run db:migrate` / `db:seed` / `db:studio` | Schema, test data, inspector |
| `npm run verify:db` | End-to-end check against a real database |
| `npm run smoke:ai` | One live Anthropic call |

One test fails on any machine with a real `ANTHROPIC_API_KEY` in `.env`. That
is expected and explained in [docs/testing.md](docs/testing.md).

## Status

Working end to end locally; **not yet deployed**. Privacy and terms pages, a
hosting and database decision, and an Inngest app sync all block a public
launch. See [docs/planning/roadmap.md](docs/planning/roadmap.md).

## A note on "referral"

The codebase contains a `patient_referral` use case. It is a **prompt preset**
for a cold introduction email between providers. Katalyst does not manage
referrals: there is no intake, assignment, tracking, completion or reporting,
and `grep -ni referr prisma/schema.prisma` returns nothing. See
[docs/decisions/marketing-site-redesign.md](docs/decisions/marketing-site-redesign.md) § 1a.
