# Development guide

## First run

```bash
cp .env.example .env
```

Fill in `DATABASE_URL` and `DIRECT_URL`, and generate a secret with
`npx auth secret`. For local sign-in without Google, keep `AUTH_DEV_LOGIN=true`.

```bash
npm install
```

Start a database. Either point at your own Postgres, or run the bundled one
(real PostgreSQL via `embedded-postgres`; no Docker) **in its own terminal**:

```bash
npm run db:local
```

Apply the schema and seed clearly-marked test data:

```bash
npm run db:migrate
npm run db:seed
```

Run the app:

```bash
npm run dev
```

Sign in with the seeded development user, `founder@example-clinic-sales.test`.
That provider only exists when `NODE_ENV === "development"` **and**
`AUTH_DEV_LOGIN === "true"`; it is unreachable in production by construction.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | `prisma generate && next build`. **See the warning below.** |
| `npm run build:verify` | Production build into `.next-verify`; safe while `dev` is running |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest, one pass |
| `npm run test:watch` | Vitest, watching |
| `npm run db:local` | Start the embedded Postgres (long-running) |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:push` | Push the schema without a migration |
| `npm run db:seed` | Seed test data |
| `npm run db:studio` | Prisma Studio |
| `npm run verify:db` | End-to-end check against a real database |
| `npm run smoke:ai` | One live Anthropic call, to prove the key works |

## Gotchas

These have each cost real time. They are not hypothetical.

### `npm run build` will break a running dev server

`next dev` and `next build` both write to `.next`. Running a production build
while the dev server is up replaces the chunks it is serving, and the browser
then gets a **404 for every stylesheet** — the page renders as unstyled HTML
and looks catastrophically broken. On Windows it usually fails earlier and
louder, with `prisma generate` hitting `EPERM` because the dev server holds a
lock on the generated client.

Use `npm run build:verify` instead. It builds into `.next-verify`, which
`next.config.ts` honours through `PREVIEW_DIST`, so a running dev server is
left completely alone.

One nuance it cannot solve: on Windows the dev server also holds the generated
Prisma query engine open, so `prisma generate` still fails with `EPERM`. That
step only matters when `schema.prisma` has changed, so the script tolerates the
failure when a generated client already exists and continues to `next build`.
**After changing the schema, stop the dev server and run `npm run db:generate`.**

If you have already run a plain `npm run build` against a live dev server, the
fix is:

```bash
# stop the dev server, then
rm -rf .next
npm run dev
```

### One test always fails locally

`src/lib/ai/draft.test.ts` → *"reports unconfigured without a key"* fails on
any machine with a real `ANTHROPIC_API_KEY` in `.env`, because the test asserts
the provider reports itself unconfigured. It is not a regression. See
[testing.md](testing.md).

### A local Postgres created under a Windows locale may be WIN1252

`CREATE DATABASE` inherits the system locale, so a local database can end up
`WIN1252` rather than `UTF8`. Inserting a clinic whose name contains an emoji
or CJK text then fails with Postgres error `22P05`, and because the failure
happens per-clinic the lead is silently dropped from the run.

`src/lib/db/encoding.ts` detects the server encoding and folds unrepresentable
characters; it is a no-op on UTF-8. Every managed Postgres provisions as UTF-8,
so this disappears on deploy. To check locally:

```sql
SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database();
```

### Stop the embedded Postgres cleanly

Killing the terminal that runs `npm run db:local` can leave Postgres in a
crashed state (`0xC000026B`, `0xC0000142` on Windows). Start it detached, and
stop it rather than killing the wrapper process.

### The dashboard can 500 on the very first load

The Prisma pool sometimes comes up stale after a restart and the first request
fails with `P1001` even though Postgres is healthy. One reload fixes it. If it
persists, the database really is down.

### The project lives in a OneDrive-synced folder

`.next`, `node_modules` and `.local-postgres` churn constantly and OneDrive
will try to sync them. Excluding those folders from sync, or moving the project
out of OneDrive, avoids file-lock errors during builds.

## Conventions

**Server Components by default.** Add `"use client"` only when a component
needs state, effects or event handlers. Putting the directive at the top of a
file pulls every export in that file into the client bundle, so keep
client-only components in their own file.

**Strict TypeScript, including `noUncheckedIndexedAccess`.** `arr[0]` is
`T | undefined`. Do not reach for `!` to silence it; narrow it.

**Comments explain *why*.** The codebase is unusually heavily commented and
that is deliberate — most comments record a decision or a trap, not a
restatement of the code. Code comments cite the build plan by section
(`docs/planning/build-plan.md Section 5`). Keep that section numbering stable.

**Colour comes from tokens, never from literals**, except inside
`src/components/marketing/`, which is deliberately dark-locked and re-pins the
Fluent variables for its own subtree. See [design-system.md](design-system.md).

**Do not commit secrets.** `.env` is gitignored and must stay that way. Add new
variables to `.env.example` with a placeholder, and to the schema in
`src/lib/env.ts` so a missing or malformed value fails loudly at boot rather
than at some random request.

## Environment variables

`src/lib/env.ts` validates them. Notable behaviour:

- Required variables missing ⇒ the app throws at boot, except during
  `next build`, where their absence is legitimate.
- An optional enum treats `""` as unset. A blank `JOB_RUNNER=` in a copied
  `.env.example` used to 500 every route, because `env.ts` is imported by
  middleware.
- An unrecognised `NODE_ENV` falls back to `production`, failing *secure*: an
  unknown environment must not re-arm a development bypass.

See [deployment.md](deployment.md) for the full production list.
