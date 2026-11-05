# Feature reference

What each part of the product does, in detail. This is reference material:
if you change behaviour, change this file in the same commit.

For how the pieces fit together, see [architecture.md](architecture.md). For
the invariants that must not be broken, see
[architecture.md § Invariants](architecture.md#invariants-do-not-break-these).

## Website auditing and lead scoring

Each researched clinic is audited from public evidence (HTML structure, HTTP/metadata, PageSpeed when configured, and discovery facts) into neutral, evidence-backed findings across five areas, then scored 0-100. No hosted browser is required; screenshots and rendered/visual checks stay behind the deferred `BrowserProvider`.

- **Categories & caps:** Website 0-30, Software 0-25, KlearQ 0-25, Contactability 0-10, Business fit 0-10 (sum clamped to 0-100).
- **Math:** `contribution = round(rulePoints × confidenceMultiplier)`. Default multipliers: Verified 1.0, Strong 0.75, Weak 0.5, Unknown 0. Each subtotal is capped; the overall is clamped to 0-100. A finding below a rule's minimum confidence contributes nothing (so weak evidence never fires a rule that needs a fact), and a finding is a "fact" only when Verified.
- **Recommendation:** the strongest area above the floor (default 8); `Combined` only when the top two both clear the floor and are within the margin (default 4); `None` (insufficient evidence) otherwise.
- **Configurable per org:** admins adjust rule weights, category caps, confidence multipliers, and recommendation thresholds in **Settings → Lead scoring**. Saving creates a new ruleset revision; existing scores keep the version that produced them until recalculated. The default ruleset is documented in `src/lib/scoring/rules.ts` and [docs/planning/build-plan.md](planning/build-plan.md).
- **Manual review (lead detail page):** recalculate, dismiss/restore findings, add a manual finding, and (admins) override the overall score or recommended service. Every manual change requires a reason and writes an immutable audit-log entry (previous value, new value, user, reason, timestamp). Automated recalculation never erases an active override. Facts are shown separately from inferences, each contribution links to its source, and the full rule-by-rule breakdown, override banner, audit history, and ruleset version are visible.
- **Rescore a campaign** after a rules change from the campaign page ("Rescore leads").

## AI email drafting

Each qualified lead can get an evidence-grounded outreach email. Nothing is sent; drafts are created for human review. Set `ANTHROPIC_API_KEY` to enable it (the model is `AI_MODEL`, default `claude-sonnet-5`, fully swappable). Without a key the feature reports as unavailable and never fabricates output.

- **Two stages.** Stage A picks the strongest strategy (Website redesign, Custom software, KlearQ, Combined, or Insufficient) from the stored score, recommendation, findings, and any manual override. Stage B calls the `AiProvider` to write the email using only the chosen observations. A manual override can change which service is pitched, but it never becomes evidence: if the override points at a service with no citable evidence, the draft is blocked rather than fabricated.
- **Only supported evidence is citable.** Only non-dismissed findings at Verified or Strong-inference confidence can be stated. Weak inferences and unknowns are excluded from what the model may write, so a weak inference can never be presented as fact.
- **Hallucination guard (deterministic, before saving).** Every factual claim is mapped to a stored finding; unsupported claims or claims based on dismissed findings block the draft. Loss/revenue/operational-failure claims without verified evidence, scraping mentions, patient impersonation, unfilled placeholders, and a dropped clinic name all block. Softer issues (an em dash, urgency wording, a word count outside 80-150, a missing portfolio link, inference-only wording) are surfaced as review warnings.
- **Each draft stores** subject, recipient name/email, clinic name, service, body, prompt version, provider + model, evidence ids + source URLs, the claim-to-evidence mapping, confidence, warnings, generation timestamp, status, and version.
- **Review workflow (lead detail page):** generate, regenerate, edit, copy, approve (admins), reject with a reason, view all evidence used, and browse or restore any previous version. Every change writes an immutable `DraftVersion` snapshot and an activity entry; approval records the user, timestamp, final content, and evidence set. Editing an approved draft returns it to review. States shown: configuration, loading, blocked, error, review, approved, rejected.
- **Bulk drafting** for a campaign's qualified leads runs as a durable background job (same runner as research): resumable, idempotent (one draft per clinic, so retries never duplicate), rate-limited (`DRAFT_BULK_DELAY_MS`), and isolated so one failing lead never stops the batch. Progress appears on the Jobs page.

## Google integrations (Gmail drafts & Calendar)

Connect a Google account to create Gmail **drafts** from approved outreach emails and to sync follow-ups to Google Calendar. Nothing is ever sent, and no Gmail send API is called.

- **Setup.** Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `TOKEN_ENCRYPTION_KEY` (base64 for exactly 32 bytes; `openssl rand -base64 32`). In Google Cloud, enable the Gmail API and Google Calendar API and register the redirect URIs (see [.env.example](../.env.example)):
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
