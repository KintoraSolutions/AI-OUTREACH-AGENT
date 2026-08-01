# Healthcare Outreach Agent

Lead research and outreach workflow for healthcare clinics. See [ai-healthcare-outreach-agent.md](ai-healthcare-outreach-agent.md) for the product brief and [plan.md](plan.md) for the implementation plan.

Phase 2 (Core Platform), Phase 3 (Clinic Research Engine), website auditing + lead scoring, Phase 4 (AI email drafting), Phase 6 (Google integrations and follow-ups), and Phase 7 (dashboard, UX, permissions, accessibility, and retention hardening) are implemented: authentication, organizations and roles, the clinic/contact/location data model, the lead pipeline, manual entry, CSV import/export, duplicate detection, notes, activity history, a dashboard with real organization-scoped metrics and charts, the compliance-first research engine (campaign discovery, website enrichment, evidence/findings, durable background jobs), a deterministic, configurable 0-100 scoring model with a service recommendation, manual overrides, and an immutable audit log, evidence-grounded AI email drafting with a two-stage workflow, hallucination checks, a review/approval workflow, version history, and durable bulk drafting, Google integrations (incremental per-user OAuth with encrypted tokens, Gmail **draft** creation from approved emails (never sending), follow-up management with optional Google Calendar sync, and dashboard reminders), the lead table with search/filter/sort/pagination, per-user **saved views**, and **bulk actions**, and configurable **data retention** with a durable, idempotent purge job (dry-run, batching, active-record protection, and an audit trail). No email is ever sent automatically; Gmail integration creates drafts only. Features that depend on unconfigured providers report as unavailable rather than showing placeholder data.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui · Prisma · PostgreSQL · Auth.js v5 (Google + dev login).

## Setup

1. Copy env and fill in values:
   ```bash
   cp .env.example .env
   ```
   Set `DATABASE_URL` / `DIRECT_URL` to a Postgres instance and generate `AUTH_SECRET` with `npx auth secret`. For local sign-in without Google, keep `AUTH_DEV_LOGIN=true`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start a database. Use your own Postgres, or start a real local one (no Docker required, powered by `embedded-postgres`) in a separate terminal:
   ```bash
   npm run db:local
   ```
4. Apply the schema and seed:
   ```bash
   npm run db:migrate   # or: npm run db:push
   npm run db:seed      # creates clearly-marked TEST DATA
   ```
5. Run the app:
   ```bash
   npm run dev
   ```
   Sign in (development) with the seeded user: `founder@example-clinic-sales.test`.

### Background research jobs (Inngest)

Research campaigns run as background jobs behind a `JobRunner` interface, so the runner is swappable and the database (`ResearchJob` / `ErrorLog`) is the source of truth for status, progress, and partial results.

- **Production** uses **Inngest** for durable, retried, resumable execution. `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are **required**; if they are missing the app refuses to run campaigns with a clear configuration error rather than silently using the in-process runner (which cannot reliably finish long crawls on serverless). Inngest calls the app at `POST /api/inngest`.
- **Local development** uses the in-process runner automatically when Inngest is not configured. To exercise the real Inngest path locally, run the Dev Server alongside `npm run dev`:
  ```bash
  npx inngest-cli@latest dev
  ```
  It auto-discovers `http://localhost:3000/api/inngest`. Set `JOB_RUNNER=inline` to force the in-process runner even when Inngest keys are present.

To verify the whole workflow end-to-end against a **real** PostgreSQL database (applies the migration, seeds, runs a tiny controlled campaign through the real repository, and checks that clinics, sources, timestamps, findings, errors, and final status are stored, with duplicates prevented):

```bash
npm run verify:db
```

## Website auditing and lead scoring

Each researched clinic is audited from public evidence (HTML structure, HTTP/metadata, PageSpeed when configured, and discovery facts) into neutral, evidence-backed findings across five areas, then scored 0-100. No hosted browser is required; screenshots and rendered/visual checks stay behind the deferred `BrowserProvider`.

- **Categories & caps:** Website 0-30, Software 0-25, KlearQ 0-25, Contactability 0-10, Business fit 0-10 (sum clamped to 0-100).
- **Math:** `contribution = round(rulePoints × confidenceMultiplier)`. Default multipliers: Verified 1.0, Strong 0.75, Weak 0.5, Unknown 0. Each subtotal is capped; the overall is clamped to 0-100. A finding below a rule's minimum confidence contributes nothing (so weak evidence never fires a rule that needs a fact), and a finding is a "fact" only when Verified.
- **Recommendation:** the strongest area above the floor (default 8); `Combined` only when the top two both clear the floor and are within the margin (default 4); `None` (insufficient evidence) otherwise.
- **Configurable per org:** admins adjust rule weights, category caps, confidence multipliers, and recommendation thresholds in **Settings → Lead scoring**. Saving creates a new ruleset revision; existing scores keep the version that produced them until recalculated. The default ruleset is documented in `src/lib/scoring/rules.ts` and [plan.md](plan.md).
- **Manual review (lead detail page):** recalculate, dismiss/restore findings, add a manual finding, and (admins) override the overall score or recommended service. Every manual change requires a reason and writes an immutable audit-log entry (previous value, new value, user, reason, timestamp). Automated recalculation never erases an active override. Facts are shown separately from inferences, each contribution links to its source, and the full rule-by-rule breakdown, override banner, audit history, and ruleset version are visible.
- **Rescore a campaign** after a rules change from the campaign page ("Rescore leads").

## AI email drafting

Each qualified lead can get an evidence-grounded outreach email. Nothing is sent; drafts are created for human review. Set `ANTHROPIC_API_KEY` to enable it (the model is `AI_MODEL`, default `claude-opus-5`, fully swappable). Without a key the feature reports as unavailable and never fabricates output.

- **Two stages.** Stage A picks the strongest strategy (Website redesign, Custom software, KlearQ, Combined, or Insufficient) from the stored score, recommendation, findings, and any manual override. Stage B calls the `AiProvider` to write the email using only the chosen observations. A manual override can change which service is pitched, but it never becomes evidence: if the override points at a service with no citable evidence, the draft is blocked rather than fabricated.
- **Only supported evidence is citable.** Only non-dismissed findings at Verified or Strong-inference confidence can be stated. Weak inferences and unknowns are excluded from what the model may write, so a weak inference can never be presented as fact.
- **Hallucination guard (deterministic, before saving).** Every factual claim is mapped to a stored finding; unsupported claims or claims based on dismissed findings block the draft. Loss/revenue/operational-failure claims without verified evidence, scraping mentions, patient impersonation, unfilled placeholders, and a dropped clinic name all block. Softer issues (an em dash, urgency wording, a word count outside 80-150, a missing portfolio link, inference-only wording) are surfaced as review warnings.
- **Each draft stores** subject, recipient name/email, clinic name, service, body, prompt version, provider + model, evidence ids + source URLs, the claim-to-evidence mapping, confidence, warnings, generation timestamp, status, and version.
- **Review workflow (lead detail page):** generate, regenerate, edit, copy, approve (admins), reject with a reason, view all evidence used, and browse or restore any previous version. Every change writes an immutable `DraftVersion` snapshot and an activity entry; approval records the user, timestamp, final content, and evidence set. Editing an approved draft returns it to review. States shown: configuration, loading, blocked, error, review, approved, rejected.
- **Bulk drafting** for a campaign's qualified leads runs as a durable background job (same runner as research): resumable, idempotent (one draft per clinic, so retries never duplicate), rate-limited (`DRAFT_BULK_DELAY_MS`), and isolated so one failing lead never stops the batch. Progress appears on the Jobs page.

## Google integrations (Gmail drafts & Calendar)

Connect a Google account to create Gmail **drafts** from approved outreach emails and to sync follow-ups to Google Calendar. Nothing is ever sent, and no Gmail send API is called.

- **Setup.** Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY` (base64 for exactly 32 bytes; `openssl rand -base64 32`). In Google Cloud, enable the Gmail API and Google Calendar API and register the redirect URIs (see [.env.example](.env.example)):
  - Sign-in: `{NEXTAUTH_URL}/api/auth/callback/google`
  - Integrations: `{NEXTAUTH_URL}/api/integrations/google/callback`
- **OAuth.** Connect from **Settings → Integrations**. Authorization is **incremental** (Gmail and Calendar are requested separately, and previously granted scopes are preserved), scopes are **least-privilege** (`gmail.compose` and `calendar.events` only — no send, no full-mailbox, no full-calendar), and `state` is signed and cookie-bound (CSRF). Access and refresh tokens are **encrypted at rest** (AES-256-GCM), refreshed transparently, revoked on disconnect, and never exposed to the client or written to logs. Connections are stored **per user within an org**; an admin can designate one connection as the org's authorized default sender.
- **Gmail drafts.** Only an **approved, unchanged** draft can create a Gmail draft, and only when the lead has a public recipient email, is not do-not-contact, is not suppressed/unsubscribed, and a Google account is connected. You review the recipient, subject, sender, and final body before creation. Creation is **idempotent** per approved version (repeated clicks never duplicate); editing an approved draft returns it to review and requires re-approval before another Gmail draft. Creating a Gmail draft advances the pipeline to "Gmail draft created" but never marks the lead contacted (a separate explicit action). The Gmail draft id, connected account, source draft version, recipient/subject, creator, timestamp, status, and any error are stored.
- **Follow-ups.** Each lead supports follow-ups with a due date/time, assignee, priority, notes, and pending/completed/cancelled/overdue states, associated with the lead and campaign. Overdue and upcoming follow-ups surface as dashboard reminders. Optionally sync a follow-up to Google Calendar: events are **idempotent** (one event per task, updated in place), cancellations delete the event, and events are created with `sendUpdates=none` and no attendees so the clinic is never invited.
- **Immutable audit.** OAuth connect/disconnect/refresh, Gmail draft creation, follow-up changes, suppression blocks, and integration errors are recorded in an append-only `IntegrationActivity` log (never containing tokens), in addition to the per-lead activity timeline.

A one-off, controlled real-model smoke test (`npm run smoke:ai`) drafts one email through the **real** Anthropic API against a throwaway local database and checks structured output, evidence mapping, the hallucination guard, and persistence. Without `ANTHROPIC_API_KEY` it reports the operation as pending rather than faking it.

## Dashboard, saved views, and bulk actions

- **Dashboard** metrics are all real and organization-scoped, and honor manual score overrides: total/new/high-priority (effective score ≥ 70)/needs-review leads, drafts awaiting review, contacted, responses, and follow-ups due, plus leads-by-category, leads-by-stage, recommended-service mix, lead-score distribution, and follow-up reminders.
- **Lead table** supports search, category/stage/score/service/confidence/finding/audit filters, sorting, and pagination. Queries are paginated and never load the full dataset into memory; soft-duplicate detection is a bounded, indexed lookup on a stored normalized name.
- **Saved views** let each user name and reuse a filter preset (scoped per user within the org). **Bulk actions** on selected leads set a pipeline stage or mark do-not-contact (which also suppresses the lead's public email).

## Data retention

Each organization has a retention window (`retentionDays`, default 365; `0` disables retention) configured in **Settings → Data retention** (admins only). A durable, idempotent purge removes **stale, unengaged** data — leads untouched since the cutoff whose stage is not engaged — plus old terminal research jobs and error logs, in bounded batches.

- **Active-record protection.** Leads that are contacted, replied, meeting-booked, marked do-not-contact, or have an approved draft, a created Gmail draft, or a pending follow-up are **never** purged.
- **Dry run.** Admins can preview exactly what a purge would remove without deleting anything.
- **Audit trail.** Every run (dry or real) appends an immutable `RetentionRun` record with counts, cutoff, actor, and status; recent runs are shown in Settings.
- **Scheduled.** In production, an Inngest cron (`retention-purge`, daily) runs the purge for every org using its own window. In local development without Inngest, use the manual **Purge now** / dry-run buttons in Settings.

## Operational test procedures (credential-dependent)

These exercise real external providers. Where credentials are not configured, the corresponding feature reports as unavailable and the test is **PENDING** — never faked.

| Procedure | How to run | Status without credentials |
| --- | --- | --- |
| **Real Anthropic drafting** | Set `ANTHROPIC_API_KEY`, then `npm run smoke:ai`. Drafts one email through the real API against a throwaway DB and asserts structured output, evidence mapping, the guard, and persistence. | PENDING (reports the config error path) |
| **Google OAuth + Gmail draft** | Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`; register the redirect URIs (below); add your address as a Test user. Connect from Settings → Integrations, approve an email draft on a lead whose recipient is a developer-controlled address, then "Create Gmail draft". Confirm a **draft** appears in Gmail; **do not send it**. No send API is ever called. | PENDING (guarded path is covered against real Postgres with a fake Google transport in `verify:db`) |
| **Inngest durable jobs** | Locally, run `npx inngest-cli@latest dev` alongside `npm run dev` (auto-discovers `/api/inngest`); run a campaign or bulk draft and watch it in the Inngest dev dashboard. In production set `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`. | Local dev uses the in-process runner automatically; production refuses to run jobs until configured |
| **Google Places discovery** | Set `GOOGLE_PLACES_API_KEY`, create a campaign with categories + geography, and run it. Discovery uses the Places Text Search API (compliant, no scraping). | PENDING (discovery reported unavailable; manual entry + CSV still work) |
| **Authenticated browser preview** | `npm run db:local` (a real local Postgres), `npm run db:migrate`, `npm run db:seed`, `npm run dev`; sign in with the dev login (`AUTH_DEV_LOGIN=true`, seeded user `founder@example-clinic-sales.test`) and exercise the dashboard, leads, settings, and retention flows. | Works locally with the dev login; Google sign-in is PENDING until OAuth is configured |

Redirect URIs to register in Google Cloud: `{NEXTAUTH_URL}/api/auth/callback/google` (sign-in) and `{NEXTAUTH_URL}/api/integrations/google/callback` (integrations).

## Deployment (Vercel + Neon + Inngest)

- **Database (Neon Postgres).** Set `DATABASE_URL` to the pooled connection string (serverless) and `DIRECT_URL` to the direct string (used by migrations). Migrations are applied automatically on deploy: Vercel runs the `vercel-build` script (`prisma generate && prisma migrate deploy && next build`), so `next build` locally/CI stays database-free while production always ships the current schema. Rollback: `prisma migrate resolve --rolled-back <migration>` plus a redeploy of the previous build; all Phase 7 migrations are additive.
- **Secrets.** Set all environment variables in Vercel (Preview + Production): `AUTH_SECRET`, `NEXTAUTH_URL`, `GOOGLE_CLIENT_ID/SECRET`, `TOKEN_ENCRYPTION_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_PLACES_API_KEY`, `PAGESPEED_API_KEY`, and `INNGEST_EVENT_KEY/SIGNING_KEY`. None are committed. Rotate `TOKEN_ENCRYPTION_KEY` only with a re-consent of Google connections (existing encrypted tokens cannot be decrypted with a new key).
- **Background jobs & cron (Inngest).** Connect the Inngest app to `POST /api/inngest` and set the event/signing keys. Inngest is **required in production** — the app refuses to run research/bulk jobs without it rather than using the in-process runner. The daily retention purge (`retention-purge` cron) fires only when Inngest is connected.
- **Providers.** Anthropic, Google OAuth/Gmail/Calendar, Google Places, and PageSpeed are all optional; unconfigured providers report as unavailable rather than faking data. Gmail/Calendar are sensitive scopes needing Google verification for production (test users during development).
- **Do not** enable automatic email sending; the app creates Gmail drafts only.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (no emit) |
| `npm run test` | Vitest unit tests |
| `npm run db:push` / `db:migrate` | Apply schema to the database |
| `npm run db:seed` | Seed development test data |
| `npm run db:studio` | Prisma Studio |
| `npm run db:local` | Start a real local Postgres (embedded, no Docker) |
| `npm run verify:db` | End-to-end workflow check against a real Postgres (research, scoring, drafting, integrations) |
| `npm run smoke:ai` | One controlled real-Anthropic drafting smoke test (pending without a key) |

All development seed data is marked `isTestData` and uses `.test` / `example` domains.
