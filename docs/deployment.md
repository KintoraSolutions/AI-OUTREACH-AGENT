# Deploying Outreach AI

This app has only ever run locally, against an embedded Postgres, with a
password-less dev login. Going public changes what several defaults mean. This
is the full path, in order, and the reasoning where a step is not obvious.

A readiness audit of the codebase found **22 blockers and 52 warnings**. The
code-level ones are fixed (see *What was already fixed*). The rest are
configuration, and they are the steps below.

---

## 1. Accounts you need

| Service | What for | Cost |
|---|---|---|
| **Vercel** | Hosting. `package.json` already has a `vercel-build` script that runs `prisma generate && prisma migrate deploy && next build`. | Hobby tier is enough |
| **Neon** (or any managed Postgres) | The real database. `embedded-postgres` is a devDependency and cannot run on a serverless host. | Free tier is enough |
| **Inngest** | Background jobs. **Not optional** — see §5. | Free tier is enough |
| **Google Cloud Console** | The OAuth client you already have, plus two new redirect URIs. | Free |

---

## 2. Database

Create a Postgres database and take **both** connection strings:

- `DATABASE_URL` — the **pooled** string (Neon: the one with `-pooler` in the host)
- `DIRECT_URL` — the **direct** string

Both are required. `prisma/schema.prisma` declares `directUrl`, and
`prisma migrate deploy` uses it rather than the pooled URL; migrations fail
against a pooler. `DIRECT_URL` is never read at runtime, which makes it easy to
omit and hard to diagnose.

### This also fixes the encoding bug

Your local database was created as `WIN1252` (from the Windows system locale),
which is why clinics whose names contain an emoji failed to insert and were
silently dropped. Every managed Postgres provisions as `UTF8`, so that class of
failure disappears on deploy. The `foldToLatin1` guard in `src/lib/db/encoding.ts`
detects the server encoding and becomes a no-op on UTF-8 — nothing to remove.

Your local data does **not** migrate automatically. The production database
starts empty. That is probably what you want (your 115 local leads include test
records), but decide deliberately.

---

## 3. Environment variables

Set these in Vercel → Project → Settings → Environment Variables. Never in a
file — `.env` is gitignored and must stay that way.

### Required — the app refuses to start without these

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Pooled connection string |
| `DIRECT_URL` | Direct connection string, for migrations |
| `AUTH_SECRET` | Generate with `npx auth secret`. Without it Auth.js throws `MissingSecret` on **every** request |
| `NEXTAUTH_URL` | Your exact deployed origin, e.g. `https://outreach.kintorasolutions.com`. **Origin only, no trailing path** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Without both, production has **zero** sign-in providers and nobody can log in |
| `TOKEN_ENCRYPTION_KEY` | Must base64-decode to **exactly 32 bytes**: `openssl rand -base64 32` |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Both, or research and bulk drafting refuse to run (§5) |
| `ANTHROPIC_API_KEY` | Drafting |

### Strongly recommended

| Variable | Why |
|---|---|
| `AUTH_ALLOWED_EMAILS` | Comma-separated sign-in allowlist, e.g. `admin@kintorasolutions.com`. See §6 |
| `GOOGLE_PLACES_API_KEY` | Discovery. Without it campaigns can only use manual/CSV leads |

### Must NOT be set

| Variable | Why |
|---|---|
| `AUTH_DEV_LOGIN` | Leave unset. It is currently `"true"` in your local `.env` |
| `JOB_RUNNER` | Ignored in production anyway; a blank value used to crash the app |
| `NODE_ENV` | Vercel sets `production` itself. Do not override |

---

## 4. Google OAuth

Two **separate** flows share one OAuth client, and both redirect URIs must be
registered exactly, or the flow fails at Google before reaching the app.

In Google Cloud Console → Credentials → your OAuth 2.0 Client → Authorised
redirect URIs, add both:

```
https://YOUR-DOMAIN/api/auth/callback/google
https://YOUR-DOMAIN/api/integrations/google/callback
```

The first is sign-in; the second is the Gmail/Calendar connection. Keep the
existing `http://localhost:3000` entries so local development still works.

**Verification status matters.** Gmail and Calendar are sensitive scopes. While
the OAuth consent screen is in *Testing*, refresh tokens expire after **7 days**
— the Gmail connection will silently stop working each week. Submit for
verification, or add yourself as a Test User and accept the weekly reconnect.

---

## 5. Inngest is mandatory

`chooseRunner()` **refuses** in production when background jobs are
unconfigured — it returns an error rather than falling back, and the
`JOB_RUNNER=inline` override is explicitly ignored in production. Without both
Inngest keys, campaign research and bulk drafting can never start. Only manual
lead entry and single-lead drafting work.

1. Create an Inngest app, take the Event Key and Signing Key.
2. Deploy first, then in Inngest Cloud **sync** the app to
   `https://YOUR-DOMAIN/api/inngest`.
3. Run one small test campaign and confirm the job reaches `RUNNING`.

Step 3 is not optional. If the app is not synced, `inngest.send()` **succeeds**
but no run ever starts, and the job sits `QUEUED`.

---

## 6. Sign-in is now closed by default

Previously there was no `signIn` callback: **any** Google account on the
internet could sign in, and first login bootstraps a personal organization with
an OWNER membership. On localhost that was harmless. On a public URL it means
strangers get their own tenant inside your app.

The policy in `src/lib/auth/sign-in-policy.ts` now works two ways:

- **`AUTH_ALLOWED_EMAILS` set** → only those addresses may sign in. Recommended.
- **Unset, in production** → existing users only. Nobody new can register.

The fallback is deliberate: your account already exists, so forgetting the
variable cannot lock you out, while a stranger still gets nothing.

Development is unrestricted, so local dev-login is unaffected.

---

## 7. Deploy

```bash
# From the project root, once the env vars above are set in Vercel:
git push origin main
```

Vercel runs `vercel-build`, which migrates the database and builds. The database
must be reachable from the build network — a failed migration fails the deploy.

---

## 8. After deploying — verify in this order

1. **Load the site signed out.** The landing page should render.
2. **Sign in with your Google account.** If refused, `AUTH_ALLOWED_EMAILS` does
   not include your address.
3. **Settings → Integrations → Connect Google.** The account chooser should
   appear (it is forced with `prompt=consent select_account`). Pick the
   **company** Workspace account, not a personal one, then **Make org default
   sender**.
4. **Sync the Inngest app** and run a tiny campaign (`maxLeads: 2`).
5. **Confirm the job reaches `RUNNING`, not just `QUEUED`.** This is the single
   most common silent failure.
6. **Generate and approve one draft**, and confirm it lands in the company
   Gmail Drafts folder.

---

## What was already fixed

Code-level blockers from the audit, now resolved:

- **`JOB_RUNNER=""` crashed the whole app.** `.env.example` shipped a blank
  value; `z.enum().optional()` forgives `undefined` but not `""`, and `env.ts`
  is imported by middleware — so copying the template 500s every route.
  Optional enums now treat blank as unset.
- **An unrecognised `NODE_ENV` crashed every request.** `"staging"` failed the
  Zod enum at import time. It now falls back to `production` — failing *secure*,
  since an unknown environment must not re-arm a development bypass.
- **The dev-login bypass was gated on `NODE_ENV !== "production"`**, which is
  permissive in the wrong direction. It now requires `"development"` explicitly.
- **Missing `AUTH_SECRET` / `DATABASE_URL` failed per-request**, so the app
  booted looking healthy and then errored on everything. It now fails loudly at
  boot, skipped during build where their absence is legitimate.
- **Open registration** — closed, per §6.
- **A `QUEUED` job permanently locked a campaign.** Cancel only set a flag that
  a non-running pipeline never read, so every retry was refused as "already
  active" with no way out of the UI. Cancel now finalizes a queued job directly.
- **A failed `runner.start()` left the campaign stuck `RUNNING`** behind a job
  that never executed. Both rows are now rolled back with a real error message.
- **CSV import advertised 5 MB** but Vercel rejects bodies over 4.5 MB at the
  edge — the friendly error could never fire. Aligned to 4 MB, including the
  help-centre copy.
- **No security headers.** Added `nosniff`, `Referrer-Policy`, `X-Frame-Options:
  DENY`, `Permissions-Policy`, HSTS; disabled the `x-powered-by` banner.
- **No `maxDuration` on `/api/inngest`.** A clinic step fetching a website
  exceeds the 10s serverless default. Set to 60s.
- **Node version unpinned.** `engines.node >= 20.9.0`.

---

## Known risks not yet addressed

Real, but they need a decision or are deployment-shaped rather than code:

- **Rotate the secrets in your local `.env`.** It sits in a OneDrive-synced
  folder. It is correctly gitignored and was never committed, but a synced copy
  of five live keys is worth rotating before the app is public.
- **Preview deployments share one Inngest app id** and can consume production
  events. Either disable preview deployments or give previews their own app id.
- **Preview deployments run `prisma migrate deploy`** against whatever
  `DATABASE_URL` they are given — point previews at a separate database.
- **`allowDangerousEmailAccountLinking: true`** auto-links any Google account to
  an existing user with the same email address.
- **Per-domain crawl pacing lives in process memory**, so it does not hold
  across serverless instances. Research may hit a single site harder than
  intended under concurrency.
- **The retention cron purges every org inside one durable step**, unbounded
  against the same function timeout.
- **Google sign-in tokens are stored unencrypted** in the `Account` table, while
  integration tokens are encrypted.

---

## Platform notes (Vercel + Neon + Inngest)

Carried over from the original README. Overlaps the sections above;
kept for the migration-rollback and key-rotation details.

- **Database (Neon Postgres).** Set `DATABASE_URL` to the pooled connection string (serverless) and `DIRECT_URL` to the direct string (used by migrations). Migrations are applied automatically on deploy: Vercel runs the `vercel-build` script (`prisma generate && prisma migrate deploy && next build`), so `next build` locally/CI stays database-free while production always ships the current schema. Rollback: `prisma migrate resolve --rolled-back <migration>` plus a redeploy of the previous build; all Phase 7 migrations are additive.
- **Secrets.** Set all environment variables in Vercel (Preview + Production): `AUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `TOKEN_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `PAGESPEED_API_KEY`, and `INNGEST_EVENT_KEY/SIGNING_KEY`. None are committed. Rotate `TOKEN_ENCRYPTION_KEY` only with a re-consent of Google connections (existing encrypted tokens cannot be decrypted with a new key).
- **Background jobs & cron (Inngest).** Connect the Inngest app to `POST /api/inngest` and set the event/signing keys. Inngest is **required in production** — the app refuses to run research/bulk jobs without it rather than using the in-process runner. The daily retention purge (`retention-purge` cron) fires only when Inngest is connected.
- **Providers.** Anthropic, Google OAuth/Gmail/Calendar, Google Places, and PageSpeed are all optional; unconfigured providers report as unavailable rather than faking data. Gmail/Calendar are sensitive scopes needing Google verification for production (test users during development).
- **Do not** enable automatic email sending; the app creates Gmail drafts only.
