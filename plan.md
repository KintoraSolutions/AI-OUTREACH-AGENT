# Implementation Plan: AI Healthcare Outreach Agent

This plan maps every requirement in [ai-healthcare-outreach-agent.md](ai-healthcare-outreach-agent.md) to a concrete implementation task. It is the Phase 1 deliverable. No implementation has started. Read the "Open Questions and Assumptions" section before building, because several requirements depend on decisions the plan flags for the user.

Guiding principles carried from the spec: reliability, evidence, human oversight, and maintainability over scraping volume. Every data provider, AI model, email provider, and research method is behind a swappable service interface. Nothing is a placeholder that looks operational but is not wired to real logic.

---

## 1. Current Repository Architecture

The repository is effectively empty. It contains only the requirements document.

```
Outreach AI/
  ai-healthcare-outreach-agent.md   requirements (16 KB)
```

Findings:

- No git repository, no `package.json`, no framework, no dependencies.
- No existing pages, components, authentication, database, API routes, environment variables, or integrations.
- No unfinished or placeholder functionality to reconcile.

Conclusion: this is a greenfield build. Every item below is net-new. There are no legacy patterns to preserve and no migration work. The one constraint inherited from an empty repo is that we choose the toolchain, so the choices in Section 2 are deliberate and justified against the spec.

---

## 2. Proposed Application Architecture

### 2.1 Stack (mandated by the spec plus justified additions)

Mandated by the spec: Next.js, TypeScript, Tailwind CSS, shadcn/ui, PostgreSQL, Prisma, Vercel-compatible architecture.

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 15, App Router, React 19, Server Components + Route Handlers + Server Actions | Mandated. App Router gives us server-side data access and streaming. |
| Language | TypeScript (strict) | Mandated. |
| Styling | Tailwind CSS v4 + shadcn/ui | Mandated. Minimal, premium interface per the dashboard section. |
| Database | PostgreSQL (Neon serverless in prod, local Postgres in dev) | Mandated. Neon is Vercel-friendly with connection pooling for serverless. |
| ORM | Prisma | Mandated. |
| Auth | Auth.js (NextAuth v5) + Prisma adapter, Google OAuth | Google OAuth is required anyway for Gmail and Calendar; one provider serves sign-in and integration scopes via incremental authorization. |
| Background jobs | Inngest, with a `ResearchJob` table as the durable source of truth | Inngest natively provides job status, retries, rate limiting, concurrency, cancellation, and step-level durability (resume), which maps almost one to one onto the Research Job System requirements and runs on Vercel serverless. Wrapped behind a `JobRunner` interface so it is swappable. |
| AI | Anthropic Claude via `@anthropic-ai/sdk`, model `claude-opus-5` | Behind an `AiProvider` interface. Structured outputs and tool use enforce schema-valid analysis and email drafts. |
| Clinic discovery | Google Places API (Text Search and Nearby Search) | Compliant, API-based discovery. Behind a `DiscoveryProvider` interface. |
| Website performance | Google PageSpeed Insights API (Lighthouse) | Compliant, no scraping. Behind a `PerformanceProvider` interface. |
| Headless browser (screenshots, DOM, console errors, rendered mobile audit) | Pluggable `BrowserProvider`, **deferred for MVP**. Default MVP implementation is a `NullBrowserProvider` that reports these features as unavailable. Hosted providers (Browserless, Cloudflare Browser Rendering) can be configured later without touching the research engine. | Avoids a paid dependency and Vercel Chromium cold-start cost for the MVP (decision 5). Basic, no-browser website checks still run (see S6). |
| HTML parsing and static analysis | cheerio | Parse meta tags, viewport, forms, links, CTAs, phone/email, tech signatures. |
| robots.txt compliance | robots-parser + a per-domain rate limiter | Required by the Data Collection rules. |
| Blob storage | Vercel Blob (or S3-compatible) for screenshots | `StorageProvider` interface. |
| Email verification | Pluggable `EmailVerifier` (NeverBounce or ZeroBounce) | Optional per the Integrations section. |
| Validation | Zod for all API inputs, env, and AI output schemas | Shared schemas across client, server, and AI tool definitions. |
| Testing | Vitest (unit), Playwright (e2e), Testing Library (components) | See Section 13. |

### 2.2 Modular service layer

All external dependencies sit behind interfaces in `src/lib/services/`. This satisfies the Final Instructions requirement that providers be replaceable.

```
DiscoveryProvider     discover(criteria) -> ClinicCandidate[]
WebsiteFetcher        fetch(url) -> { html, status, headers, redirects, robotsAllowed }
BrowserProvider       capabilities() -> { screenshots, consoleErrors, renderedMobile } (all false in NullBrowserProvider)
                      render(url, viewport) -> { screenshotKey, domSummary, consoleErrors } | throws NotConfigured
PerformanceProvider   audit(url) -> { perfScore, lcp, cls, mobileFriendly, ... }
AiProvider            analyze(evidence) -> StructuredAudit ; draftEmail(context) -> EmailDraft
EmailVerifier         verify(email) -> { status, confidence }
StorageProvider       put(key, bytes) / getUrl(key)
GmailProvider         createDraft(orgAuth, draft) -> gmailDraftId
CalendarProvider      createEvent(orgAuth, event) -> eventId
JobRunner             enqueue(jobType, payload) ; cancel(jobId)
```

Each has a real implementation and, where useful for tests, a deterministic fake. No fake ships to production.

### 2.3 Directory layout

```
src/
  app/
    (marketing)/                 public landing + compliance notice
    (auth)/                      sign-in, org selection
    (dashboard)/
      dashboard/                 main dashboard (metrics + charts)
      campaigns/                 create + list search campaigns
      leads/                     lead table (search/filter/sort/paginate/bulk)
      leads/[id]/                lead detail page
      settings/                  scoring weights, integrations, retention, suppression
      jobs/                      research job monitor
    api/
      auth/[...nextauth]/        Auth.js handlers
      inngest/                   Inngest serverless endpoint
      campaigns/                 CRUD
      leads/                     list/detail/update/bulk/export
      drafts/                    generate/edit/approve/reject
      integrations/gmail/        create draft, OAuth callback
      integrations/calendar/     create follow-up event
      import/                    CSV import
      webhooks/                  (future) email provider events
  components/                    shadcn/ui + app components
  lib/
    services/                    provider interfaces + implementations
    scoring/                     configurable scoring engine
    ai/                          prompt templates, schemas, hallucination checks
    research/                    pipeline steps (discover, collect, audit, score)
    auth/                        session, org, RBAC helpers
    db/                          prisma client
    validation/                  zod schemas
  inngest/                       job function definitions
prisma/
  schema.prisma
  seed.ts
```

### 2.4 Request and data flow (happy path)

1. User creates a Search Campaign (categories, geography, radius, limits, keyword filters, min locations).
2. API enqueues a `campaign.research` job via `JobRunner`. A `ResearchJob` row is created.
3. Inngest fans out: discover clinics -> for each clinic, a child job collects public info, fetches the website (robots-checked, rate-limited), runs the audit (static + performance + screenshot), stores sources, dedupes, and scores.
4. Each clinic result is written incrementally (partial-result saving). One failed website marks that clinic job failed and continues the campaign.
5. When a lead reaches "Draft ready" (or on user action), the AI drafts a personalized email grounded only in stored evidence. A hallucination check verifies every claim maps to an evidence row.
6. The lead and its evidence, score breakdown, screenshots, and draft appear in the dashboard.
7. A human reviews, edits, approves, copies or creates a Gmail draft, marks contacted, schedules follow-up, and records replies. Every action writes an `OutreachActivity` audit row.

---

## 2A. Provider Interfaces: Defaults, Cost, Environment Variables, and Limits

Every external capability is behind an interface (decision 2). This table documents the default provider selected for each, its cost implications, the environment variables it needs, and known usage limits. Defaults can be swapped without changing callers. Where a provider is deferred or optional, the MVP ships a null implementation that reports the feature as unavailable rather than faking results (see Section 2B).

| Interface | Default provider (MVP) | Cost implications | Required env vars | Usage limits / notes |
| --- | --- | --- | --- | --- |
| `AiProvider` | Anthropic Claude, model `claude-opus-5` | Paid per token. Opus 5 is ~$5 / 1M input, ~$25 / 1M output. Two calls per lead (analyze + draft); prompts are small (evidence only), so cost per lead is low. Model id is overridable via `AI_MODEL` (e.g. `claude-sonnet-5` at ~$3 / $15 for higher volume). | `ANTHROPIC_API_KEY`, `AI_MODEL` (optional) | Standard tier rate limits (RPM/TPM). Structured outputs enforce schema; adaptive thinking on. |
| `DiscoveryProvider` | Google Places API (Text Search + Nearby) | Paid per request after Google's monthly free credit. Text/Nearby Search is priced per call; each campaign issues a bounded number of searches. | `GOOGLE_PLACES_API_KEY` | Per-key QPS limits; results paginated. Restrict key by IP/referrer. Compliant API access, not map scraping. |
| `PerformanceProvider` | Google PageSpeed Insights API (Lighthouse) | Free with a key; generous daily quota. | `PAGESPEED_API_KEY` | ~25,000 requests/day and ~240/min per key (Google published limits; confirm at build). One call per audited site. |
| `BrowserProvider` | `NullBrowserProvider` (deferred, decision 5) | None in MVP. A hosted provider (Browserless ~usage-based, Cloudflare Browser Rendering ~usage-based) can be added later. | `BROWSER_PROVIDER` (default `null`), `BROWSERLESS_API_KEY` or `CLOUDFLARE_BROWSER_TOKEN` when enabled | Screenshots, rendered mobile audit, and console-error inspection are marked unavailable until configured. Basic no-browser checks still run. |
| `WebsiteFetcher` | Native `fetch` + cheerio + robots-parser | Free (own compute). | none | Per-domain rate limiting; obeys robots.txt and crawl-delay; SSRF-guarded; capped redirects and body size. |
| `StorageProvider` | Vercel Blob | Paid by storage/bandwidth; near-zero in MVP because screenshots are deferred. | `BLOB_READ_WRITE_TOKEN` | Only used once screenshots are enabled. |
| `EmailVerifier` | `NullEmailVerifier` (optional, off by default) | None until enabled. NeverBounce/ZeroBounce are paid per verification. | `EMAIL_VERIFIER` (default `none`), `EMAIL_VERIFIER_API_KEY` | When off, contact emails stay `UNVERIFIED`; no fake verification. |
| `GmailProvider` | Google Gmail API (draft creation only) | Free API; requires Google verification for sensitive scopes in production. | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (shared OAuth) | `gmail.compose` scope only. No send in v1. Test users during development. |
| `CalendarProvider` | Google Calendar API | Free API; sensitive scope. | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `calendar.events` scope. |
| `JobRunner` | Inngest (decision 3) | Free tier covers MVP volume; paid at scale. | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Concurrency/throttle configured per function. Abstracted so it can move to a Postgres-backed queue later (see S5). |

Estimated external dependencies to provision before Phase 3 and beyond: Anthropic account (AI), Google Cloud project with Places + PageSpeed + OAuth consent (discovery, performance, Gmail, Calendar), Neon Postgres, Vercel Blob, Inngest account. Deferred/optional: a hosted browser provider, an email-verification provider.

## 2B. Behavior When Provider Credentials Are Missing (No Fake Fallbacks)

Per decision 6, the system never fabricates results to cover a missing provider. Instead:

- On startup and in a Settings "System status" panel, the validated env module reports which providers are configured and which are not.
- Each provider interface exposes `isConfigured()` and `capabilities()`. A provider without credentials returns `isConfigured() = false` and its implementation throws a typed `ProviderNotConfiguredError` if called directly.
- The UI surfaces a clear configuration warning naming the exact unavailable functionality, for example: "Clinic discovery is unavailable: GOOGLE_PLACES_API_KEY is not set," or "Screenshots and console-error inspection are unavailable: no hosted browser is configured."
- Actions that depend on an unconfigured provider are disabled with an inline explanation rather than silently producing empty or synthetic data.
- Deterministic fakes exist only in the test suite (Section 13). No fake implementation is registered in a production build.

---

## 3. Database Schema

Prisma models covering all 18 required entities. All models include timestamps; provenance fields (`sourceUrl`, `collectedAt`, `confidence`) appear on data that is collected or inferred. IDs are `cuid()`. Money and scores are integers or decimals as noted. Enums are Prisma enums.

```prisma
// ---------- Identity and tenancy ----------
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String?
  image         String?
  memberships   Membership[]
  accounts      Account[]   // Auth.js
  sessions      Session[]   // Auth.js
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Organization {
  id            String   @id @default(cuid())
  name          String
  // Company identity used in emails (fills the [COMPANY NAME]/[PORTFOLIO URL]/[CONTACT URL] placeholders).
  // All editable in Settings; never hardcoded.
  companyName   String?
  portfolioUrl  String?
  contactUrl    String?
  senderName    String?
  senderEmail   String?
  // KlearQ product information used when pitching KlearQ. Editable in Settings; never hardcoded.
  klearqProductName String?
  klearqTagline     String?
  klearqUrl         String?
  klearqCapabilities String[]   // capability bullet points surfaced to the drafting prompt
  memberships   Membership[]
  campaigns     SearchCampaign[]
  clinics       Clinic[]
  settings      SystemSetting[]
  suppression   SuppressionEntry[]
  integrations  Integration[]
  retentionDays Int      @default(365)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// Per-org OAuth connections (Gmail, Calendar). Tokens encrypted at rest with TOKEN_ENCRYPTION_KEY,
// never exposed to the client. Absence of a row means the integration is not configured (see S2B).
model Integration {
  id            String   @id @default(cuid())
  orgId         String
  organization  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  provider      String            // "google_gmail" | "google_calendar"
  accountEmail  String?
  scopes        String[]
  accessTokenEnc  String?         // encrypted
  refreshTokenEnc String?         // encrypted
  expiresAt     DateTime?
  connectedById String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([orgId, provider])
}

enum Role { OWNER ADMIN MEMBER VIEWER }

model Membership {
  id            String   @id @default(cuid())
  userId        String
  orgId         String
  role          Role     @default(MEMBER)
  user          User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
  @@unique([userId, orgId])
}

// ---------- Campaigns ----------
model SearchCampaign {
  id            String   @id @default(cuid())
  orgId         String
  organization  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  name          String
  categories    String[]           // clinic categories
  city          String?
  region        String?            // province/state
  country       String?
  radiusMeters  Int?
  minLocations  Int      @default(1)
  maxLeads      Int      @default(50)
  requiredKeywords String[]
  excludedKeywords String[]
  status        CampaignStatus @default(DRAFT)
  jobs          ResearchJob[]
  clinics       Clinic[]
  createdById   String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

enum CampaignStatus { DRAFT RUNNING PAUSED COMPLETED CANCELLED }

// ---------- Clinic and related ----------
model Clinic {
  id            String   @id @default(cuid())
  orgId         String
  organization  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  campaignId    String?
  campaign      SearchCampaign? @relation(fields: [campaignId], references: [id])
  name          String
  category      String?
  websiteUrl    String?
  mainPhone     String?
  publicEmail   String?
  contactPageUrl String?
  bookingMethod String?            // e.g. "call to book", "online booking"
  onlineBookingUrl String?
  socialLinks   Json?              // { platform: url }
  businessHours Json?              // structured hours, may vary per location
  websiteTech   String[]          // detected technologies (best-effort)
  locationCount Int      @default(1)
  // dedupe key: normalized domain + normalized name + primary address hash
  dedupeKey     String
  stage         PipelineStage @default(DISCOVERED)
  doNotContact  Boolean  @default(false)
  collectedAt   DateTime?
  locations     ClinicLocation[]
  contacts      Contact[]
  audits        WebsiteAudit[]
  scores        LeadScore[]
  sources       Source[]
  drafts        EmailDraft[]
  activities    OutreachActivity[]
  followUps     FollowUpTask[]
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([orgId, dedupeKey])     // hard duplicate prevention at DB level
  @@index([orgId, stage])
}

enum PipelineStage {
  DISCOVERED RESEARCHING QUALIFIED DRAFT_READY NEEDS_REVIEW
  APPROVED CONTACTED REPLIED MEETING_BOOKED NOT_INTERESTED
  FOLLOW_UP_LATER DISQUALIFIED
}

model ClinicLocation {
  id            String   @id @default(cuid())
  clinicId      String
  clinic        Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  address       String?
  phone         String?
  hours         Json?
  sourceUrl     String?
  collectedAt   DateTime @default(now())
}

model Contact {
  id            String   @id @default(cuid())
  clinicId      String
  clinic        Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  name          String?
  jobTitle      String?            // owner, director, clinic manager, administrator
  email         String?
  emailStatus   EmailStatus @default(UNKNOWN)
  phone         String?
  isDecisionMaker Boolean @default(false)
  sourceUrl     String?
  collectedAt   DateTime @default(now())
}

enum EmailStatus { UNKNOWN VALID INVALID RISKY UNVERIFIED }

// ---------- Website audit + findings ----------
model WebsiteAudit {
  id            String   @id @default(cuid())
  clinicId      String
  clinic        Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  url           String
  performanceScore Int?           // 0-100 from PageSpeed
  lcpMs         Int?
  cls           Float?
  mobileFriendly Boolean?
  httpsValid    Boolean?
  screenshotKey String?           // StorageProvider key (desktop)
  screenshotMobileKey String?
  checkedAt     DateTime @default(now())
  findings      AuditFinding[]
}

enum FindingCategory { DESIGN_USABILITY TECHNICAL CONVERSION }
enum Confidence { VERIFIED STRONG_INFERENCE WEAK_INFERENCE UNKNOWN }

model AuditFinding {
  id            String   @id @default(cuid())
  auditId       String
  audit         WebsiteAudit @relation(fields: [auditId], references: [id], onDelete: Cascade)
  category      FindingCategory
  code          String            // stable machine key, e.g. "no_clear_booking_cta"
  finding       String            // neutral, non-insulting observation
  evidence      String            // supporting evidence text
  sourceUrl     String
  checkedAt     DateTime @default(now())
  confidence    Confidence
}

// ---------- Scoring ----------
model LeadScore {
  id            String   @id @default(cuid())
  clinicId      String
  clinic        Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  websiteScore  Int      // 0-30
  softwareScore Int      // 0-25
  klearqScore   Int      // 0-25
  contactabilityScore Int // 0-10
  businessFitScore Int   // 0-10
  overallScore  Int      // 0-100
  recommendedService RecommendedService
  breakdown     Json     // signal-by-signal contributions with weights used
  weightsVersion String  // which weight set produced this score
  computedAt    DateTime @default(now())
}

enum RecommendedService { WEBSITE SOFTWARE KLEARQ COMBINED NONE }

// ---------- Provenance ----------
model Source {
  id            String   @id @default(cuid())
  clinicId      String
  clinic        Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  url           String
  type          String            // "official_site", "directory", "places_api", etc.
  retrievedAt   DateTime @default(now())
  notes         String?
}

// ---------- Email drafts ----------
enum DraftStatus { GENERATED EDITED APPROVED REJECTED SENT_EXTERNAL }

model EmailDraft {
  id            String   @id @default(cuid())
  clinicId      String
  clinic        Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  contactId     String?
  service       RecommendedService
  subject       String
  recipientName String?
  recipientEmail String?
  body          String
  personalizationEvidence Json    // list of { claim, findingId, sourceUrl }
  confidence    Int               // 0-100
  reviewWarnings String[]         // required human-review warnings
  status        DraftStatus @default(GENERATED)
  aiModel       String
  promptVersion String
  gmailDraftId  String?
  editedBody    String?
  createdById   String?
  approvedById  String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// ---------- Activity + follow-ups ----------
enum ActivityType {
  RESEARCH_COMPLETED DRAFT_GENERATED DRAFT_EDITED DRAFT_APPROVED DRAFT_REJECTED
  GMAIL_DRAFT_CREATED MARKED_CONTACTED REPLY_RECORDED MEETING_BOOKED
  NOTE_ADDED STAGE_CHANGED FOLLOW_UP_SCHEDULED DO_NOT_CONTACT_SET
}

model OutreachActivity {
  id            String   @id @default(cuid())
  clinicId      String
  clinic        Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  type          ActivityType
  note          String?
  metadata      Json?
  actorId       String?           // user who performed it (null for system)
  createdAt     DateTime @default(now())
  @@index([clinicId, createdAt])
}

model FollowUpTask {
  id            String   @id @default(cuid())
  clinicId      String
  clinic        Clinic   @relation(fields: [clinicId], references: [id], onDelete: Cascade)
  dueDate       DateTime
  note          String?
  done          Boolean  @default(false)
  calendarEventId String?
  assigneeId    String?
  createdAt     DateTime @default(now())
  @@index([clinicId, dueDate])
}

// ---------- Suppression + settings + jobs + errors ----------
model SuppressionEntry {
  id            String   @id @default(cuid())
  orgId         String
  organization  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  emailOrDomain String
  reason        String?
  createdAt     DateTime @default(now())
  @@unique([orgId, emailOrDomain])
}

model SystemSetting {
  id            String   @id @default(cuid())
  orgId         String
  organization  Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  key           String            // e.g. "scoring.weights", "outreach.dailyLimit"
  value         Json
  updatedAt     DateTime @updatedAt
  @@unique([orgId, key])
}

enum JobStatus { QUEUED RUNNING SUCCEEDED FAILED CANCELLED PARTIAL }

model ResearchJob {
  id            String   @id @default(cuid())
  orgId         String
  campaignId    String?
  campaign      SearchCampaign? @relation(fields: [campaignId], references: [id])
  type          String            // "campaign.research", "clinic.collect", "clinic.audit"
  status        JobStatus @default(QUEUED)
  progress      Int      @default(0)   // 0-100
  total         Int?
  processed     Int      @default(0)
  succeeded     Int      @default(0)
  failed        Int      @default(0)
  cancelRequested Boolean @default(false)
  runnerRef     String?           // Inngest run id, for correlation
  startedAt     DateTime?
  finishedAt    DateTime?
  createdAt     DateTime @default(now())
  errors        ErrorLog[]
  @@index([orgId, status])
}

model ErrorLog {
  id            String   @id @default(cuid())
  jobId         String?
  job           ResearchJob? @relation(fields: [jobId], references: [id], onDelete: SetNull)
  scope         String            // "discovery", "fetch", "audit", "ai", "gmail"
  targetUrl     String?
  message       String
  stack         String?
  retryable     Boolean  @default(true)
  createdAt     DateTime @default(now())
}

// Auth.js models (Account, Session, VerificationToken) added per the adapter schema.
```

Notes:

- Duplicate prevention is enforced two ways: a normalized `dedupeKey` with a DB unique constraint per org, plus a soft-match check during discovery (fuzzy name plus domain) before insert.
- `doNotContact` on Clinic and `SuppressionEntry` per org together satisfy do-not-contact and suppression requirements.
- Score `breakdown` and `weightsVersion` make every score explainable and reproducible.

---

## 4. Required API Routes

REST-style Route Handlers plus Server Actions for form-driven mutations. All routes are org-scoped and permission-checked (Section 9). All inputs validated with Zod.

| Method + Path | Purpose | Min role |
| --- | --- | --- |
| `GET/POST /api/campaigns` | List / create search campaigns | MEMBER / ADMIN |
| `GET/PATCH/DELETE /api/campaigns/[id]` | Read / update / delete campaign | MEMBER / ADMIN |
| `POST /api/campaigns/[id]/run` | Enqueue research job | ADMIN |
| `POST /api/campaigns/[id]/cancel` | Request cancellation | ADMIN |
| `GET /api/leads` | Lead table: search, filter, sort, paginate | VIEWER |
| `GET /api/leads/[id]` | Lead detail (clinic, contacts, audit, evidence, score, draft, timeline) | VIEWER |
| `PATCH /api/leads/[id]` | Update stage, notes, do-not-contact | MEMBER |
| `POST /api/leads/bulk` | Bulk stage change / disqualify / add to suppression | MEMBER |
| `POST /api/leads` | Manual lead entry | MEMBER |
| `GET /api/leads/export` | CSV export (respects current filters) | MEMBER |
| `POST /api/import` | CSV import (validated, deduped) | MEMBER |
| `POST /api/drafts/generate` | Generate AI draft for a lead | MEMBER |
| `PATCH /api/drafts/[id]` | Edit draft body / subject | MEMBER |
| `POST /api/drafts/[id]/approve` | Approve draft | ADMIN |
| `POST /api/drafts/[id]/reject` | Reject draft | MEMBER |
| `POST /api/integrations/gmail/draft` | Create Gmail draft from approved draft | MEMBER |
| `GET /api/integrations/gmail/callback` | OAuth callback (incremental scopes) | MEMBER |
| `POST /api/integrations/calendar/event` | Create follow-up calendar event | MEMBER |
| `GET/PATCH /api/settings` | Read / update scoring weights, limits, retention | ADMIN |
| `GET/POST/DELETE /api/suppression` | Manage suppression list | ADMIN |
| `GET /api/jobs` and `GET /api/jobs/[id]` | Job status and progress | MEMBER |
| `POST /api/inngest` | Inngest serverless function endpoint | system |
| `GET/POST /api/auth/[...nextauth]` | Auth.js | public |

Server Actions mirror the mutating routes for the dashboard forms (create campaign, update lead, edit draft, add note, schedule follow-up) to keep the UI simple while reusing the same validation and permission helpers.

---

## 5. Background Job Architecture

Requirement: job status, progress, retry handling, rate limiting, error reporting, source tracking, duplicate prevention, partial-result saving, cancellation, resume, and no single failed website stops a campaign.

Design: Inngest functions define the workflow; the `ResearchJob` and `ErrorLog` tables are the durable, queryable source of truth the dashboard reads.

Functions:

1. `campaign.research` (fan-out orchestrator)
   - Loads campaign criteria, calls `DiscoveryProvider`, applies keyword and min-location filters, dedupes candidates against existing clinics.
   - Uses Inngest `step.run` for each stage so completed steps are not repeated on retry (this is the resume capability).
   - Uses `throttle`/`concurrency` config for rate limiting across the fan-out.
   - Emits one `clinic.research` event per candidate up to `maxLeads`. Writes `total` to `ResearchJob`.
   - Honors `cancelRequested`: checks the flag between steps and stops enqueuing.

2. `clinic.research` (per-clinic pipeline)
   - Steps: collect public info -> robots check + fetch website -> static analysis -> performance audit -> screenshot/DOM/console -> persist sources -> compute score -> set stage.
   - Each step is a durable `step.run`. Partial results are written as each step completes, so a failure late in the pipeline still leaves earlier data saved.
   - Per-domain rate limiting via Inngest `throttle` keyed on the domain.
   - On failure: writes an `ErrorLog`, marks the clinic-level job failed, increments the campaign `failed` counter, and returns. The orchestrator continues. This satisfies "one failed website does not stop the campaign."
   - Retries: Inngest retries transient failures (network, 5xx) with backoff; non-retryable failures (robots disallow, 404) are recorded and skipped.

3. `draft.generate` (optional async path for bulk drafting)
   - Grounded generation plus hallucination check (Section 7). Can also run synchronously from the API for single drafts.

Progress: each step updates `ResearchJob.progress`, `processed`, `succeeded`, `failed`. The `/jobs` page polls `GET /api/jobs/[id]` (or subscribes via Inngest realtime if enabled).

Swappability (decision 3): the research engine must not import Inngest. The layering is:

- `src/lib/research/` holds pure pipeline steps (discover, collect, fetch, analyze, score) as plain async functions that take inputs and a small `JobContext` (progress reporter, cancellation check, logger) and return results. These functions know nothing about the job runner.
- `src/inngest/` holds thin Inngest functions that wire the runner's `step.run`, retry, throttle, and concurrency onto those pure steps, and update the `ResearchJob`/`ErrorLog` rows.
- `JobRunner` interface wraps `enqueue(jobType, payload)` and `cancel(jobId)`; callers (API routes, Server Actions) depend only on this interface.

Because progress, status, retries, cancellation, and partial results are all persisted in the database (the source of truth), moving to a Postgres-backed queue plus Vercel Cron later means rewriting only the thin `src/inngest/` adapter and the `JobRunner` implementation. The pure `src/lib/research/` steps, the DB contract, and the dashboard are unchanged.

---

## 6. Research and Scraping Architecture

Compliance-first. The Data Collection rules forbid bypassing authentication, CAPTCHAs, access restrictions, rate limits, robots.txt, or website terms, and forbid scraping private profiles or personal data not publicly presented for business contact. No patient or health data is collected.

Pipeline stages and how each respects the rules:

1. Discovery (`DiscoveryProvider`)
   - Google Places API Text Search and Nearby Search by category, city/region/country, and radius. This is compliant API access, not scraping Google Maps.
   - Returns candidate name, address, phone, website, and place types.

2. Public info collection
   - From Places details plus the clinic's own website. Extract main phone, public business email, contact-page URL, booking method, online booking URL, social links, business hours, and publicly listed owner/director/manager where the site presents it for business contact.
   - Never collect personal profiles from gated platforms. Never collect patient or health data.

3. Website fetch (`WebsiteFetcher`)
   - Fetch robots.txt first; parse with robots-parser; obey disallow and crawl-delay. Identify with a clear, honest User-Agent.
   - Per-domain rate limiting. On CAPTCHA, login wall, or 403/429, stop and record a non-retryable skip. Do not attempt to bypass.

4. Static analysis (cheerio)
   - Presence and clarity of booking CTA and phone CTA, viewport/mobile meta, HTTPS, metadata, broken internal links (bounded sample), forms and apparent validation, provider/location/service pages, trust indicators and testimonials, number of phone numbers, multi-location and multi-department signals.
   - Tech detection via a Wappalyzer-style signature match (best-effort; recorded with confidence).

5. Performance audit (`PerformanceProvider`)
   - Google PageSpeed Insights API for performance score, LCP, CLS, and mobile-friendliness. Compliant, no scraping.

6. Browser audit (`BrowserProvider`, deferred for MVP)
   - MVP ships `NullBrowserProvider`: `capabilities()` returns all false, and screenshots, rendered mobile audit, and console-error inspection are marked unavailable in the UI (no fake data, per S2B).
   - The basic, no-browser checks in step 4 still run and cover mobile-friendliness heuristically: viewport meta presence, responsive/media-query hints in linked CSS, tap-target and font-size hints from HTML, HTTPS, metadata, and the PageSpeed mobile-friendliness signal from step 5.
   - When a hosted `BrowserProvider` is configured later, it adds desktop and mobile screenshots to `StorageProvider`, a rendered DOM summary, and safely captured console errors, with no change to the research engine (it only reads `capabilities()` and calls `render()` when available).

   Basic (MVP, no browser): booking/phone CTA presence and clarity, viewport/responsive hints, HTTPS, metadata, bounded broken-link sample, form presence/apparent validation, provider/location/service pages, trust indicators, phone-number count, multi-location/department signals, tech signatures, and PageSpeed metrics. Browser-dependent (deferred): screenshots, rendered mobile layout audit, console-error inspection.

7. Evidence, sources, dedupe, scoring
   - Every observation becomes an `AuditFinding` with finding, evidence, source URL, date, and confidence. Every fetched URL becomes a `Source`.
   - Dedupe against existing clinics by normalized domain plus fuzzy name plus address hash before insert; DB unique constraint is the backstop.
   - Score with the configurable engine (Section 2) and set `recommendedService`.

Failure isolation and partial saving are handled by the job layer (Section 5).

---

## 6A. Default Scoring Model

A documented default model ships with the app; all point values and caps are editable per org via `SystemSetting` key `scoring.weights` and stamped with `weightsVersion` on each `LeadScore` (decision 4). The engine is a pure function of stored evidence: each rule maps to a finding/signal, fires only when its condition holds, and contributes points. The `LeadScore.breakdown` JSON records every rule that fired, the points awarded, the confidence multiplier applied, and the source finding, so the Lead Detail page can show the exact rules that produced each subtotal.

Category caps (from the spec): Website 0-30, Software 0-25, KlearQ 0-25, Contactability 0-10, Business fit 0-10. Overall is the sum, 0-100.

Default rules and points:

Website opportunity (cap 30)

| Rule code | Condition | Points |
| --- | --- | --- |
| `no_clear_booking_cta` | No clear booking action detected | 8 |
| `poor_mobile_usability` | No viewport meta / not mobile-friendly (PageSpeed) | 6 |
| `poor_performance` | PageSpeed performance < 50 | 5 |
| `broken_pages` | Broken link(s) in bounded sample | 3 |
| `missing_https` | Site not served over HTTPS | 3 |
| `weak_primary_cta` | No prominent primary call to action | 3 |
| `missing_location_info` | No location/address info on site | 2 |

Custom software opportunity (cap 25)

| Rule code | Condition | Points |
| --- | --- | --- |
| `multiple_locations` | More than one location | 6 |
| `manual_intake_or_call_first` | Call-first booking / no online intake | 4 |
| `disconnected_booking_systems` | Multiple distinct booking systems detected | 4 |
| `complex_forms_or_referral` | Complex form/referral workflow signals | 4 |
| `several_departments_or_providers` | Multiple departments/providers | 4 |
| `complex_service_navigation` | Deep/complex service navigation | 3 |

KlearQ opportunity (cap 25)

| Rule code | Condition | Points |
| --- | --- | --- |
| `multiple_locations` | More than one location | 6 |
| `several_phone_numbers` | More than one distinct phone number | 5 |
| `call_first_no_online_booking` | "Call to book" is the main method / no online booking | 5 |
| `centralized_reception` | Single central reception signal | 3 |
| `several_departments_or_providers` | Multiple departments/providers | 3 |
| `phone_response_complaints` | Reliable public complaints about unanswered calls/hold times/callbacks | 3 |

Contactability (cap 10)

| Rule code | Condition | Points |
| --- | --- | --- |
| `decision_maker_email` | Public decision-maker email present | 4 |
| `general_business_email` | General business email present | 2 |
| `functional_contact_form` | Contact form appears functional | 2 |
| `clinic_manager_listed` | Clinic manager/administrator listed | 1 |
| `verified_site_and_phone` | Website and phone both verified | 1 |

Business fit (cap 10)

| Rule code | Condition | Points |
| --- | --- | --- |
| `is_healthcare_clinic` | Matches a target clinic category | 4 |
| `appropriate_geography` | Within the campaign's area | 3 |
| `active_business` | Site reachable and shows recent activity | 2 |
| `reasonable_clinic_size` | Size within target range | 1 |

Confidence weighting: each contribution is multiplied by a confidence factor from the underlying finding, default `VERIFIED` = 1.0, `STRONG_INFERENCE` = 0.75, `WEAK_INFERENCE` = 0.5, `UNKNOWN` = 0. These factors are also editable. This keeps inferred signals from scoring like verified facts, consistent with the Evidence and Confidence rules.

Recommended service selection (defaults, all thresholds editable):

- Compute Website, Software, and KlearQ subtotals.
- If the highest subtotal is below a floor (default 8), `recommendedService = NONE`.
- If the top two are within a closeness margin (default 4 points) and both above the floor, `recommendedService = COMBINED`.
- Otherwise the single highest becomes the recommendation (`WEBSITE`, `SOFTWARE`, or `KLEARQ`).

The `phone_response_complaints` rule fires only on reliable evidence, honoring the spec's rule not to claim lost calls or revenue without support; when it does not fire, the KlearQ pitch uses the careful "may make call routing and callback visibility more difficult" wording instead.

---

## 7. AI Email-Generation Workflow

Provider: Anthropic Claude via `@anthropic-ai/sdk`, model `claude-opus-5`, behind the `AiProvider` interface. Adaptive thinking on. Structured outputs (`output_config.format`) or strict tool use enforce schema validity. Every model choice is centralized so it can be swapped.

Two-stage, evidence-grounded design:

Stage A: Analysis and service recommendation

- Input: the stored, structured evidence for a clinic (findings, contact data, location/phone/booking signals). The model does not browse; it only reasons over evidence we already collected and verified.
- Output (schema-enforced): recommended service (website / software / KlearQ / combined), the single strongest opportunity, per-signal rationale referencing finding IDs, and uncertainties. This feeds both the score explanation and the draft.
- Guardrail: the KlearQ and custom-software cases must cite real evidence. Prompt forbids inventing problems and requires careful wording (for example, "Your multi-location setup may make call routing and callback visibility more difficult") rather than claims of lost calls or revenue.

Stage B: Draft generation

- Input: clinic name, decision-maker name and email when available, the chosen service, and the specific findings selected in Stage A (with their source URLs). Plus org identity (company name, portfolio URL, contact URL, sender signature).
- Output (schema-enforced `EmailDraft`): subject, recipient name, recipient email, body (80 to 150 words by default), service pitched, personalization evidence (each claim linked to a finding ID and source URL), confidence score, and required human-review warnings.
- Strategy templates: separate prompt templates for website redesign, custom software, KlearQ, and combined. Only the strongest opportunity leads; the email does not force all three services.
- Style constraints enforced by prompt and a post-check: correct clinic name, one or two real observations, specific business outcome, simple call to action, natural and professional tone. Avoid generic AI phrasing, em dashes, excessive compliments, pretending to be a patient, false familiarity, manipulative urgency, and any mention that the clinic was scraped. Include the portfolio link only when pitching website work.

Hallucination and safety checks (deterministic, after generation):

- Claim-to-evidence check: every claim in `personalizationEvidence` must reference an existing `AuditFinding` for this clinic. Unmatched claims fail the draft and it is regenerated or flagged for review.
- Name check: the clinic name in the body matches the stored name.
- Forbidden-content check: reject em dashes, "as a patient" style phrasing, and scrape-mention patterns.
- Length check: word count within the configured band; warn if outside.
- Recipient check: if no verified decision-maker email exists, the draft is generated without inventing one and carries a review warning.

Output is always a draft. The system never sends automatically in this version.

---

## 8. Dashboard Pages and Components

Minimal, premium interface with shadcn/ui. Avoid excessive rounded cards, unnecessary gradients, oversized empty space, and decorative animations.

Main Dashboard (`/dashboard`)

- Metric tiles: total leads, new leads, high-priority leads, drafts awaiting review, contacted, responses, follow-ups due.
- Charts: leads by clinic category, leads by location, leads by recommended service, lead-score distribution.
- Components: `MetricTile`, `CategoryBreakdownChart`, `LocationBreakdownChart`, `ServiceMixChart`, `ScoreHistogram`.

Lead Table (`/leads`)

- Columns: clinic, category, location, website score, software score, KlearQ score, overall score, recommended service, contact status, draft status, last researched, follow-up date.
- Features: search, filtering, sorting, pagination, bulk selection, duplicate detection indicator, saved views, CSV export.
- Components: `LeadTable` (TanStack Table), `LeadFilters`, `SavedViews`, `BulkActionsBar`, `ExportButton`, `DuplicateBadge`.

Lead Detail (`/leads/[id]`)

- Sections: clinic overview, contact information, locations, services, website screenshots/preview, website-audit findings, supporting evidence, score breakdown, recommended pitch, generated email draft, editable notes, activity timeline, source URLs, research date, confidence indicators.
- Components: `ClinicOverview`, `ContactCard`, `LocationsList`, `ScreenshotGallery` (renders an "unavailable until a hosted browser is configured" state in MVP, decision 5), `FindingsList` (grouped by category, each with evidence/source/date/confidence), `ScoreBreakdown` (lists each rule that fired with its points, confidence multiplier, and source finding per Section 6A), `PitchPanel`, `DraftEditor` (edit, approve, reject, copy, create Gmail draft), `NotesEditor`, `ActivityTimeline`, `SourceList`, `ConfidenceBadge`.

Pipeline

- Configurable stages exactly as listed in the spec (Discovered through Disqualified), rendered as a board or a status column with drag or dropdown stage changes. Stage changes write `OutreachActivity` rows.

Cross-cutting UI states (required by the testing section): empty states, loading skeletons, and error states for every data view.

Settings (`/settings`)

- Org identity editor: company name, portfolio URL, contact URL, sender name/email, and KlearQ product info (name, tagline, URL, capability bullets). Stored on `Organization`; never hardcoded (decision 1).
- Scoring model editor: adjust per-rule points, category caps, confidence factors, and recommendation thresholds (Section 6A). Saving stamps a new `weightsVersion` for future scores; existing scores keep the version that produced them.
- Integrations: connect Gmail/Calendar via Google OAuth (incremental scopes).
- Retention controls, suppression list management, outreach daily limit.
- System status panel: shows each provider's configured/unconfigured state and names the functionality unavailable for anything missing (decision 6).
- Compliance notice acknowledgement (Section 12).

Jobs (`/jobs`)

- Live research job status, progress, per-clinic success/failure counts, error log, and a cancel action.

---

## 9. Authentication and Organization Permissions

- Auth.js (NextAuth v5) with the Google provider and the Prisma adapter. Sign-in with Google.
- Multi-tenancy: `Organization` with `Membership` join and a `Role` enum (OWNER, ADMIN, MEMBER, VIEWER). A user can belong to multiple orgs; the active org is stored in the session.
- Authorization: a `requireRole(orgId, minRole)` helper runs in every Route Handler and Server Action. Every query is org-scoped by `orgId` so one org cannot read another's data.
- Role capabilities:
  - VIEWER: read leads, dashboards, evidence.
  - MEMBER: create/edit leads and drafts, add notes, schedule follow-ups, import/export, create Gmail drafts.
  - ADMIN: run/cancel campaigns, approve drafts, edit settings and scoring weights, manage suppression and integrations.
  - OWNER: everything plus manage members and org identity.
- Integration tokens (Gmail/Calendar refresh tokens) are stored per org, encrypted at rest, never exposed to the client. Incremental authorization requests the Gmail and Calendar scopes only when the user connects those integrations.

---

## 10. Gmail and Calendar Integration Plan

Both are behind provider interfaces so they can be swapped or disabled.

Gmail (draft creation only in v1)

- Scope: `gmail.compose` (create drafts). No send scope in v1.
- Flow: user connects Google account with incremental consent -> we store the refresh token encrypted per org -> on "Create Gmail draft," we build a MIME message from the approved `EmailDraft` and call the Gmail API `users.drafts.create`. We store `gmailDraftId` on the draft and write a `GMAIL_DRAFT_CREATED` activity.
- The user reviews and sends inside Gmail. The system never sends.

Calendar (follow-ups)

- Scope: `calendar.events`.
- Flow: scheduling a follow-up optionally creates a Calendar event and stores `calendarEventId` on the `FollowUpTask`.

Guardrails

- Creating a Gmail draft requires an approved draft (`DraftStatus.APPROVED`) and a recipient that is not on the suppression list and whose clinic is not `doNotContact`.
- All integration actions are audited.
- Note for deployment: Gmail and Calendar scopes are sensitive and require Google verification for production. In development, use test users (see Section 14 and Open Questions).

Architecture also leaves room (per the Integrations section) for CRM export, search/business-directory APIs, website performance APIs, and email verification providers, all behind interfaces.

---

## 11. Required Environment Variables

No secrets are hardcoded. All are read through a validated env module (Zod).

```
# Core
DATABASE_URL=                     # Postgres (Neon in prod)
DIRECT_URL=                       # Prisma migrations (Neon direct)
NEXTAUTH_URL=
AUTH_SECRET=

# Google OAuth (sign-in + Gmail + Calendar)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Anthropic (AI)
ANTHROPIC_API_KEY=
AI_MODEL=claude-opus-5            # overridable

# Discovery + performance
GOOGLE_PLACES_API_KEY=
PAGESPEED_API_KEY=

# Headless browser (DEFERRED for MVP; default null)
BROWSER_PROVIDER=null            # "null" (default) | "browserless" | "cloudflare" | "playwright-local"
BROWSERLESS_API_KEY=             # only when BROWSER_PROVIDER=browserless
CLOUDFLARE_BROWSER_TOKEN=        # only when BROWSER_PROVIDER=cloudflare

# Background jobs
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Storage (screenshots)
BLOB_READ_WRITE_TOKEN=           # Vercel Blob, or S3 creds if S3

# Email verification (optional)
EMAIL_VERIFIER=                  # "neverbounce" | "zerobounce" | "none"
EMAIL_VERIFIER_API_KEY=

# Encryption for stored OAuth tokens
TOKEN_ENCRYPTION_KEY=
```

Company identity ([COMPANY NAME], portfolio URL, contact URL), sender information, and KlearQ product info are stored per org in the database (`Organization` fields), not in env, because they are tenant-specific and user-editable (decision 1). Scoring weights are likewise per-org settings, not env (decision 4).

`EMAIL_VERIFIER` defaults to `none` and `BROWSER_PROVIDER` defaults to `null`; when unset, the related features report as unavailable (Section 2B) rather than falling back to fake data (decision 6).

---

## 12. Compliance and Safety Controls

Directly implementing the Compliance and Safety section:

- Human approval before any outreach. No auto-send in v1. Gmail integration creates drafts only.
- Business-purpose contact data only. Collection logic excludes patient, health, and non-business personal data by design.
- Source attribution. Every finding and datum carries a source URL and date; `Source` rows track provenance.
- Data-retention controls. `Organization.retentionDays` plus a scheduled purge job that deletes or anonymizes stale research data.
- Suppression lists and do-not-contact. `SuppressionEntry` per org and `Clinic.doNotContact`; enforced before draft generation and Gmail draft creation.
- Unsubscribe tracking and configurable outreach limits. Data model and settings (`outreach.dailyLimit`) are in place for when sending is added; suppression captures unsubscribe requests now.
- Audit logs. `OutreachActivity` records every human and system action affecting a lead.
- Clear sender identification and no misleading identities. Sender name/email come from org settings; the AI is forbidden from impersonating a patient or feigning familiarity.
- No automatic contact-form spam and no bypassing website protections. The fetcher never submits forms and never bypasses CAPTCHAs, logins, or rate limits.
- No scraping patient or sensitive health data. Enforced in collection.
- User responsibility notice. A prominent, acknowledged notice in the app states that the user is responsible for ensuring each campaign complies with laws applying to sender and recipient. Acknowledgement is stored per org.

Any future sending feature is gated behind explicit approval and must add daily limits, suppression enforcement, unsubscribe handling, and full audit logs before it can be enabled.

---

## 13. Testing Strategy

Mapped to the spec's Phase 6 list.

- Unit (Vitest): scoring engine (weights, breakdown, boundaries), dedupe key normalization, evidence-to-claim hallucination check, robots.txt handling, CSV import/export parsing, email/phone extraction, confidence classification.
- Provider fakes: deterministic fakes for Discovery, WebsiteFetcher, Browser, Performance, and AI so pipeline tests are hermetic and do not hit external APIs.
- Integration: research pipeline end to end against fakes, including a deliberately failing website to prove failure isolation and partial-result saving; duplicate handling; rate-limit behavior; cancellation and resume.
- Auth and permissions: role boundary tests for every route (VIEWER cannot mutate, MEMBER cannot approve or run campaigns, cross-org access denied).
- AI accuracy: draft tests assert claims map to evidence, name correctness, length band, forbidden phrasing (em dashes, patient impersonation, scrape mentions), and that only the strongest service leads.
- Draft approval workflow: generate -> edit -> approve/reject -> Gmail draft creation (mocked Gmail).
- Component and e2e (Playwright + Testing Library): mobile responsiveness, accessibility (axe checks, keyboard nav, labels), and empty/loading/error states for dashboard, lead table, and lead detail.

CI runs unit and integration on every PR; e2e on a preview deployment.

---

## 14. Deployment Requirements

- Host: Vercel (mandated compatibility). App Router with serverless functions.
- Database: Neon Postgres with pooled connection string for serverless and a direct string for Prisma migrations. Run `prisma migrate deploy` in the build/release step.
- Background jobs: Inngest app connected to the `/api/inngest` endpoint; event and signing keys in Vercel env. Cloud concurrency and throttle configured per function.
- Storage: Vercel Blob (or S3) for screenshots.
- Headless browser: deferred for the MVP (decision 5). The `NullBrowserProvider` needs no infrastructure. A hosted provider (Browserless or Cloudflare Browser Rendering) can be configured later via env vars with no engine changes; bundling Chromium on Vercel is avoided.
- Secrets: all via Vercel environment variables across Preview and Production; none in source.
- Google Cloud: OAuth consent screen configured; Gmail and Calendar are sensitive scopes and need Google verification for production. Use test users during development. Places and PageSpeed keys restricted by referrer/IP.
- Observability: structured logging, `ErrorLog` table for pipeline errors, and Vercel/Inngest dashboards for runtime.
- Scheduled jobs: a Vercel Cron or Inngest cron for the retention purge and for follow-up-due reminders.

---

## 15. Phased Implementation Checklist

Ordered to match the spec's phases. Each item is a concrete task.

Phase 1: Planning (this document)

- [x] Inspect repository and summarize current architecture.
- [x] Create `plan.md`.
- [x] Identify missing env vars and integrations (Section 11).
- [x] Propose database schema (Section 3).
- [x] List assumptions (Open Questions section).
- [x] Create prioritized task checklist (this section).

Phase 2: Core Platform

- [x] Scaffold Next.js 15 + TypeScript + Tailwind v4 + shadcn/ui; ESLint (flat config); Zod env validation with a provider registry exposing `isConfigured()`/`providerStatus()` per provider.
- [x] Prisma schema and generated client; seed script with clearly-marked test data. (Migration applied with `db push`/`migrate` when a Postgres `DATABASE_URL` is set; Neon provisioning is an ops step.)
- [x] Auth.js v5 with Google + a dev-only credentials login, Prisma adapter, Organization/Membership/Role, `requireRole`/`requireOrgContext` helpers, cookie-based active-org with switcher, first-login org bootstrap.
- [x] Dashboard shell (sidebar nav, top bar, org switcher, user menu) with empty/loading/error primitives.
- [x] Settings: org identity + KlearQ editors and the System status panel (config warnings for unconfigured providers, decision 6) + compliance acknowledgement.
- [x] Clinic, Contact, and Location records; manual lead entry; lead editing.
- [x] Lead pipeline stages, inline + bulk stage transitions, do-not-contact, follow-ups, all with activity logging.
- [x] CSV import (validated, deduped, header-mapped) and CSV export (respects filters).
- [x] Lead detail page wired to real data (overview, contacts, locations, notes, activity timeline, sources, follow-ups); audit/score/draft sections show honest "populated in later phases" states.
- [x] Duplicate detection (normalized dedupe key + DB unique constraint + soft-match "possible duplicate" flag).
- [x] Verified: `npm run lint` (0 warnings), `npm run typecheck` (0 errors), `npm run test` (12 passing), and `npm run build` (all routes compile) pass.

Phase 3: Research Engine

- [x] Provider interfaces for Discovery, WebsiteFetcher, Browser, Performance, each with `isConfigured()`/`capabilities()`. `NullBrowserProvider` is the MVP default; test-only fakes live in the test suite, never in production (decision 6). (Storage/Blob remains deferred with the hosted browser.)
- [x] Configurable clinic search (Places) with keyword and min-location filters.
- [x] robots.txt handling, per-domain rate limiting, and SSRF guards.
- [x] Public info collection (contacts, phones, booking method, social, tech signals; hours best-effort). No patient/health/private data collected.
- [x] Website analysis: basic no-browser checks + PageSpeed performance. Screenshots, rendered mobile audit, and console-error inspection marked unavailable until a hosted browser is configured (decision 5).
- [x] Source storage and provenance (`Source` per fetched URL, `collectedAt` on clinic/locations/contacts/audit).
- [x] Duplicate detection (soft match at discovery + DB unique constraint backstop).
- [x] Evidence and confidence system (AuditFinding with neutral wording + confidence level).
- [x] Scoring engine implementing the default model (Section 6A) with editable per-org weights, confidence weighting, breakdown, and weights version. Plus deterministic auditing across all five areas, manual review (dismiss/add findings, override score/service), immutable audit log, and rescoring. See "Website Auditing and Lead Scoring" below.
- [x] Pure research steps in `src/lib/research/` (no runner import) + a runner-agnostic orchestrator behind a `JobRunner` interface: discovery + per-clinic pipeline with retries, partial saves, cancellation, pause/resume, and failure isolation. Ships **both** runners: the durable `InngestJobRunner` (production default; `src/inngest/` drives the pipeline through memoized `step.run` boundaries via an injected `JobStepRunner`) and the in-process `InlineJobRunner` (development/tests only, never used in production). No pipeline/UI change was needed to add Inngest because the DB is the source of truth. See "Phase 3 Infrastructure" below.
- [x] Jobs monitor page (`/jobs`) plus per-campaign run history with live progress and errors.

Phase 4: AI Drafting

- [x] AiProvider (Anthropic) with structured outputs, prompt versioning, retry + timeout, and clear config errors; model configurable via `AI_MODEL`; never a fake fallback in production.
- [x] Service recommendation logic (Stage A) grounded in evidence and override-aware; a manual override never becomes evidence.
- [x] Prompt templates: website, software, KlearQ, combined (versioned `draft-v1`).
- [x] Draft generation (Stage B) using only citable evidence, targeting the 80 to 150 word band.
- [x] Hallucination checks (claim-to-evidence, dismissed-evidence rejection, weak-inference wording, name/placeholder, forbidden content, loss-claim gating, length, recipient).
- [x] Draft generate/regenerate, edit, approve, reject, copy, version history + restore, with an immutable snapshot per change.
- [x] Evidence-linked personalization surfaced in the UI; durable bulk drafting for qualified leads. See "Evidence-Grounded AI Email Drafting (Prompt 5)" below.

Phase 5 / 6: Integrations and Follow-Ups

- [x] Google OAuth incremental scopes; encrypted **per-user** token storage (with an optional org default sender).
- [x] Gmail draft creation from approved drafts (approved-only, idempotent, suppression and do-not-contact enforced, no sending).
- [x] Calendar follow-up events (idempotent, update/cancel sync, no attendee notifications).
- [x] Follow-up management (date/time, assignee, priority, notes, pending/completed/cancelled/overdue, dashboard reminders).
- [ ] CSV export polish and CRM-export interface stub.
- [ ] Optional email verification provider.

Phase 6: Testing and Hardening

- [x] Unit + integration tests for the Google integration: OAuth state, token encryption/refresh/revocation/expiry, least-privilege scopes, approved-only + idempotent Gmail creation, suppression/do-not-contact blocking, no send API usage, edited-approved reset, follow-up overdue logic, calendar create/update/cancel, no attendee notifications, org isolation, and provider failure handling (Vitest + real-Postgres `verify:db`).
- [x] A controlled real-Anthropic drafting smoke test (`npm run smoke:ai`); pending without a key rather than faked.

Phase 7: Dashboard, UX, Permissions, Accessibility, and Retention Hardening

- [x] Dashboard metrics all real and organization-scoped, honoring effective manual overrides (high-priority via effective score, drafts awaiting review, service mix, score distribution) — no stale placeholders.
- [x] Lead table search/filter/sort/pagination with per-user saved views, bulk actions (stage + do-not-contact/suppress), and CSV import/export; no full-dataset loads (paginated queries, bounded indexed duplicate detection via a stored `normalizedName`, import dedupe bounded to the import's keys).
- [x] Authorization + organization-isolation audit of every page, server action, API route, and background job (no IDOR / cross-tenant gaps; `orgId` never read from user input); negative-access (`roleAtLeast` matrix) and cross-organization tests added.
- [x] Accessibility + responsiveness: reduced-motion CSS, visible focus, skip-to-content link, collapsible mobile nav, form-error association (`aria-describedby`/`aria-invalid`), dialog focus management (Radix), table overflow, and larger tap targets.
- [x] Configurable retention + a durable, idempotent purge job (dry-run, batching, active-record protection, immutable `RetentionRun` audit) with a daily Inngest cron and manual admin controls.
- [x] Empty, loading, and error states reviewed across views; compliance notice and audit-log review.
- [ ] Deferred (out of scope): CRM export beyond CSV (interface stub), optional email-verification provider.

Acceptance criteria (from the spec) are satisfied when a user can create a campaign, select categories and geography, discover legitimate clinics, collect public info, analyze websites, view evidence for every finding, receive a transparent score, see the strongest service fit, review and edit and approve a draft, create a Gmail draft or copy the email, track the lead through the pipeline, schedule and manage follow-ups, export data, and have duplicates and do-not-contact respected.

---

## Phase 2 Implementation Notes and Unresolved Issues

What shipped in Phase 2 (Core Platform):

- Auth: Auth.js v5 with a Google provider (used when configured) plus a development-only credentials login gated by `NODE_ENV !== "production"` and `AUTH_DEV_LOGIN=true`. JWT session strategy; the Prisma adapter persists users/accounts. Edge-safe config (`src/auth.config.ts`) is split from the Node config (`src/auth.ts`) so Prisma never enters the middleware/edge bundle.
- Tenancy and RBAC: Organization/Membership/Role with `requireRole`/`requireOrgContext`; every query and mutation is org-scoped; role checks gate create/edit (MEMBER), approve/settings/delete (ADMIN). Active org is a cookie with a switcher; first login bootstraps a personal org.
- Data model: full schema generated (all Phase 2 entities plus the later-phase models so no future schema churn). Duplicate prevention via normalized `dedupeKey` + a per-org unique constraint, with soft-match flagging in the table.
- Features: manual lead create/edit, CSV import (header-mapped, validated, deduped) and export (filter-aware), inline and bulk stage changes, notes, contacts, locations, follow-ups, do-not-contact (auto-adds to suppression), and a full activity audit trail. Dashboard metrics + category/stage breakdowns. Settings with org identity, KlearQ fields, system status, and compliance acknowledgement. Empty/loading/error states throughout.
- Provider integrity (decision 6): the System status panel and provider registry report what is configured; unconfigured providers name their unavailable functionality. No fake data or non-functional buttons; deferred features (research, AI, screenshots) show honest "later phase" states.

Verification performed in this environment: `npm run lint` (0 warnings), `npm run typecheck` (0 errors), `npm run test` (12 passing: dedupe + CSV), and `npm run build` (all 12 routes compile, middleware builds). The sign-in page was rendered in a browser to confirm the UI and the missing-provider config warning display correctly.

Unresolved items and constraints:

- No Postgres was provisioned in this environment, so migrations were not run against a live database and DB-backed flows (dashboard, leads CRUD, import) were validated by build + type checking rather than at runtime. To run locally: set `DATABASE_URL`/`DIRECT_URL`, then `npm run db:push` (or `db:migrate`) and `npm run db:seed`.
- Browser verification was limited to `/signin` because DB-backed pages need Postgres. Screenshots could not be captured (the preview pane does not composite frames in this environment); structure was verified via the accessibility tree.
- Toolchain resolved to bleeding-edge versions (TypeScript 6, Vitest 4, lucide-react 1, Next 15.5). Everything passes; pin versions before release if reproducibility matters.
- `next lint` prints a deprecation notice (Next 16 will remove it). Migrate to the ESLint CLI (`@next/codemod next-lint-to-eslint-cli`) in a later pass.
- Google OAuth and Gmail/Calendar are not connected yet (Phase 5); the dev credentials login covers local use. Token encryption (`TOKEN_ENCRYPTION_KEY`) is defined but not exercised until integrations land.
- Not built in Phase 2 (out of scope or later phases): organization member management/invitations UI, suppression-list management UI (the model exists and do-not-contact auto-populates it), saved views for the lead table, and charts beyond simple bar lists. Research/scoring/AI-draft sections render honest placeholders.

---

## Phase 3 Implementation Notes and Unresolved Issues

What shipped in Phase 3 (Clinic Research Engine):

- Campaigns: create a search campaign with categories, city/region/country, radius, max leads, min locations, and required/excluded keywords (`/campaigns`, `/campaigns/new`, `/campaigns/[id]`). Validation in `src/lib/validation/campaign.ts`; actions in `src/app/(dashboard)/campaigns/actions.ts` (create/run/pause/resume/cancel/delete, RBAC-gated: create MEMBER, run/manage ADMIN).
- Provider abstraction (`src/lib/research/providers/`): `DiscoveryProvider` (Google Places Text Search, compliant API use) with a `NullDiscoveryProvider`; `PerformanceProvider` (PageSpeed) with a Null variant; `BrowserProvider` (`NullBrowserProvider`, deferred); and a credential-free, compliance-first `WebsiteFetcher`. `getProviderBundle()` picks the real provider only when its credentials exist, else the Null variant — no fake data.
- Compliance-first fetching (`fetcher.ts` + `robots.ts` + `rate-limit.ts` + `url-guard.ts`): fetches and obeys robots.txt (Disallow + Crawl-delay), rate-limits per domain, identifies with an honest User-Agent, refuses non-public/internal targets (SSRF guard), caps body size + timeout, and treats 401/403/429/CAPTCHA/login walls as non-recoverable skips — never bypassed. Only public business info is read; no patient/health/private data.
- Pipeline (`discover.ts`, `enrich.ts`, `analyze.ts`, `extract.ts`, `pipeline.ts`): discovery with keyword + min-location filtering and dedupe; per-clinic enrichment extracts public emails/phones, booking method, online-booking URL, contact page, social links, services, and locations; static findings + optional PageSpeed audit; every fetched URL stored as a `Source` with `collectedAt`. Recoverable failures retried with backoff; non-recoverable ones recorded and skipped; a failing website still saves the discovery-derived record (partial results); one failure never stops the campaign.
- Jobs: `ResearchJob` + `ErrorLog` are the durable source of truth. States map to the required set — Queued, Running, Paused, Completed (`SUCCEEDED`), Partially completed (`PARTIAL`), Failed, Cancelled. Progress, counts, and errors surface on `/jobs` and the campaign page, which auto-refresh while a job is active.
- Runner abstraction (`runner.ts`): callers depend on a `JobRunner` interface. The MVP ships `InlineJobRunner` (real, in-process). Because status/progress/partial results are persisted, swapping in an Inngest-backed runner later needs no pipeline or UI change (decision 3).

Verification performed in this environment: `npm run typecheck` (0 errors), `npm run lint` (0 warnings), `npm run test` (45 passing, 7 files), and `npm run build` (all 16 routes + middleware compile). The research workflow was exercised end-to-end on a small controlled campaign via `src/lib/research/pipeline.test.ts` using fake providers and an in-memory repository (test-only, per decision 6), asserting: sources and collection timestamps are stored; duplicates are prevented; a recoverable website failure is retried then succeeds; a permanently-blocked website still saves partial results and the campaign continues; a hard save failure is isolated and reported as PARTIAL; and cancellation and pause are honored between clinics.

Unresolved items and constraints:

- The Prisma-backed repository (`repository.ts`) and the live crawl path are now validated against a **real** PostgreSQL database (see "Phase 3 Infrastructure" below), in addition to the in-memory workflow test. To run for real with automated discovery, also set `GOOGLE_PLACES_API_KEY` (optionally `PAGESPEED_API_KEY`).
- Scoring (Section 6A) is intentionally deferred to the next Phase 3 increment; evidence/findings are already captured to feed it. Screenshots, rendered mobile audits, and console-error inspection remain unavailable until a hosted browser provider is configured (decision 5). `radiusMeters` is stored and shown but only biases Places results, not a hard cutoff.
- The website extractor is regex/heuristic (dependency-free), so contact/booking/location detection is best-effort; business hours are not yet parsed. Discovery is one Places Text Search per category; a Nearby/2-step details pass could enrich location counts later.

---

## Phase 3 Infrastructure: Durable Background Jobs (Inngest)

This closes the background-job infrastructure gaps left open when Phase 3 first shipped with only the in-process runner. The research engine is unchanged; this is purely the runner + persistence layer.

Architecture (realizes decision 3):

- **Two runners behind `JobRunner`** (`src/lib/research/runner.ts`):
  - `InngestJobRunner` (durable, `durable: true`) — the production default. `start()` sends the `campaign/research.requested` event; an Inngest function drives the pipeline.
  - `InlineJobRunner` (in-process, `durable: false`) — real and useful for local development and controlled tests, but never selected in production.
- **Selection policy** — a pure, unit-tested `chooseRunner({ nodeEnv, inngestConfigured, override })`: production REQUIRES Inngest and returns a clear error (surfaced by the run/resume actions and, in production, a config banner) if its keys are missing — it never silently falls back to the inline runner; a `JOB_RUNNER` override can pick a runner in development but cannot force inline in production. Outside production, Inngest is used when configured, else the inline runner.
- **Runner-agnostic durable steps** — the orchestrator (`pipeline.ts`) wraps each unit of work in an injected `JobStepRunner.run(id, fn)` (`types.ts` / `steps.ts`). Inline/test runs pass through; the Inngest function (`src/inngest/functions.ts`) supplies an adapter over `step.run`, so the *same* pipeline gains memoized, resumable steps with no Inngest import in `src/lib/research/`.
- **Endpoint** — `src/app/api/inngest/route.ts` serves the function at `POST /api/inngest` (outside the auth middleware matcher). The client (`src/inngest/client.ts`) reads `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`.

Safe resume + idempotency (items 5-7) are layered so re-delivery, retries, restarts, and mid-step interruption never duplicate work:

1. **Event level** — `InngestJobRunner` sends with a stable event id (`campaign-research-<jobId>`), so a duplicate send is de-duplicated before a run starts.
2. **Function level** — `idempotency: "event.data.jobId"` allows at most one live run per job even if two distinct events arrive.
3. **Step level** — `step.run` memoizes each completed unit (discovery, per-clinic enrich+save, each control check), so a replay never re-enriches or re-saves a completed clinic. Pause/cancel are read inside per-iteration control steps, so a pause requested during a run — or before a resume — is honored between clinics.
4. **Database level** — the `@@unique([orgId, dedupeKey])` constraint plus the single-transaction clinic write means a clinic and its sources/findings/locations cannot be duplicated even if a step is interrupted mid-write and later retried; a resumed run also skips already-saved clinics via `existingDedupeKeys` at discovery.

An `onFailure` handler mirrors the inline runner's catch: if the function ultimately fails past its retries, the job is moved out of RUNNING and the error recorded.

Database migration: the schema is now under Prisma **migrations** (`prisma/migrations/…_init_healthcare_schema`), replacing the earlier `db push`-only flow, so `prisma migrate deploy` applies it deterministically in CI/production. This baseline includes the Phase 3 job-control fields (`JobStatus.PAUSED`, `ResearchJob.pauseRequested`, `ResearchJob.message`).

Verification performed in this environment (against a **real PostgreSQL 18** started locally via `embedded-postgres`, no Docker):

- `npm run verify:db` applied the migration (`migrate deploy`), seeded, and ran a tiny controlled campaign through the real `PrismaResearchRepository` (a 2-clinic set: one real, safe public site + one with no website; the compliance-first fetcher; no Places key, no outreach, no sensitive data). It confirmed the database stored the campaign, job progress (status `SUCCEEDED`, progress 100, processed 2), clinic records, source URLs with `retrievedAt`, collection timestamps, audit findings, and an `ErrorLog` row, and that a second run created **zero** duplicates.
- Tests: `chooseRunner` matrix (production-config failure, no inline-in-prod) in `runner.test.ts`; duplicate-delivery/replay, at-least-once retry idempotency, interrupted-job recovery, and pause-between-steps in `idempotency.test.ts` (via a memoizing/at-least-once/interrupting `JobStepRunner` over the in-memory repo).

Remaining limitations:

- Inngest itself was exercised through the pipeline's step seam and its config (idempotency/concurrency/retries) is declarative; a full Cloud/Dev-Server round trip is an ops step (run `npx inngest-cli dev` with `npm run dev`, or connect the Inngest app in production). The platform-level event/function de-dup is Inngest's guarantee; the app's job is to make re-execution safe, which the tests cover.
- Automated discovery still needs `GOOGLE_PLACES_API_KEY`; the verification used a controlled discovery set. Scoring, hosted-browser features, and AI drafting remain deferred as noted above.

---

## Website Auditing and Lead Scoring (Prompt 4)

Deterministic auditing + transparent, configurable scoring built on the research engine. No hosted browser is required; screenshots, rendered mobile audits, and console checks remain behind the deferred `BrowserProvider`.

Modules (`src/lib/scoring/`): `rules.ts` (documented default ruleset), `config.ts` (org overrides via `SystemSetting` key `scoring.weights`, merged onto defaults), `audit.ts` (evidence builder), `engine.ts` (pure scorer), `rescore.ts` (DB recompute preserving overrides), `adapters.ts`/`view.ts` (shape helpers). The research engine stays free of Inngest; scoring is pure and injected into the pipeline via `repo.loadScoringConfig` + `scoreClinic`.

**Audit → evidence.** For each clinic, `buildAuditFindings` produces neutral, evidence-backed findings across Website, Software, KlearQ, Contactability, and Business fit, from public HTML structure, HTTP/metadata, PageSpeed (when configured), and discovery facts. Discovery-derived signals (category, geography, locations, phones) are evaluated even when the website is unreachable, so a no-website lead is still audited and scored. Every finding stores: category, rule id (`code`), rule version, human explanation, evidence, source URL, date checked, confidence (`VERIFIED`/`STRONG_INFERENCE`/`WEAK_INFERENCE`/`UNKNOWN`), a fact/inference flag (fact = VERIFIED only), and its point contribution. Findings are deduplicated and idempotent via a `@@unique([auditId, code])` constraint and a single current audit per clinic (`@@unique([clinicId])`). A finding is a VERIFIED fact only when directly observed; inferences are labelled and never overstated.

**Scoring math (defaults).** Category caps: Website 0-30, Software 0-25, KlearQ 0-25, Contactability 0-10, Business fit 0-10. For each non-dismissed finding, `contribution = round(rulePoints × confidenceMultiplier)`, where multipliers are `VERIFIED 1.0`, `STRONG_INFERENCE 0.75`, `WEAK_INFERENCE 0.5`, `UNKNOWN 0` (all editable). Each category subtotal is clamped to `[0, cap]`; the overall is `clamp(sum, 0, 100)`. A rule contributes nothing when the finding's confidence is below the rule's minimum (unsupported-claim rejection) — e.g. `web_missing_https` requires VERIFIED, and `kq_phone_response_complaints` requires VERIFIED so it never auto-fires (we do not scrape reviews). Manual findings score by their explicit points and category. Overall confidence (HIGH/MEDIUM/LOW) reflects the share of points from verified facts (≥0.6 HIGH, ≥0.3 MEDIUM, else LOW). Scoring is deterministic for the same findings + ruleset; the ruleset version (`default-v1`, or `custom-r<n>` once an org saves overrides) is stamped on every score and finding so rescoring is reproducible.

**Recommendation.** From the Website/Software/KlearQ subtotals: below the floor (default 8) → `NONE` (insufficient evidence); COMBINED only when the top two both clear the floor AND are within the closeness margin (default 4) — never merely because a second area is nonzero; otherwise the single strongest area. The stored breakdown records the reason, alternatives, uncertainties, and missing information.

**Manual review + audit log.** Authorized users can recalculate, dismiss/restore findings, add manual findings, and (admins) override the overall score or service and edit the org scoring rules. Every manual change writes an immutable `AuditLogEntry` (action, entity, previous value, new value, actor, required reason, timestamp). Recalculation rewrites only the computed fields and **preserves an active override** (it never touches the `manualOverride`/`override*` columns). The lead detail page separates facts from inferences, shows the rule-by-rule breakdown with evidence + source links + fact/inference labels, the override banner, the audit history, and the ruleset version; the lead table adds all category scores, overall, service, confidence, finding count, and last-audited, with filters for score range, service, confidence, finding type, audit status, and audit date. Campaigns can be rescored after a rules change.

**Pipeline integration.** Audit + scoring run inside each clinic's durable step (stable id `clinic-<i>-<dedupeKey>`) after enrichment and are persisted with the clinic in one transaction, so retries never create duplicate findings or scores (unique constraints are the backstop) and a failure on one clinic never stops the campaign. Pause/cancel still work between clinics. The core engine has no Inngest dependency.

**Schema additions.** `FindingCategory` is now the opportunity area (WEBSITE/SOFTWARE/KLEARQ/CONTACTABILITY/BUSINESS_FIT). `AuditFinding` gains `ruleVersion`, `scoreContribution`, `isFact`, `subarea`, `manual`/`manualPoints`, dismissal fields, and `@@unique([auditId, code])`. `WebsiteAudit` gains `status` and `@@unique([clinicId])`. `LeadScore` gains `recommendationReason`, `confidence` (`ScoreConfidence`), the override columns, and `@@unique([clinicId])`. New `AuditLogEntry` model + `AuditLogAction` enum; `Clinic.lastAuditedAt`. No new environment variables.

Verification (real PostgreSQL via `npm run verify:db`): the repository stored audit findings, sources, confidence levels, fact/inference classifications, score categories, rule contributions (with evidence + source), the recommendation, the ruleset version, and audit timestamps; a second run created no duplicate findings or scores; recalculation preserved a manual override; and a rules-change rescore re-stamped the ruleset version. Unit tests (`engine.test.ts`, `audit.test.ts`) cover determinism, category/overall limits, configurable weights, confidence multipliers, fact/inference handling, unsupported-claim rejection, dismissal, combined/insufficient recommendations, and the five clinic-profile fixtures (call-first multi-location, modern online-booking, complex multi-location, insufficient-evidence, conflicting signals).

Limitations: the extractor is regex/heuristic, so some Software/KlearQ signals (referral, departments, downloadable forms, disconnected systems, navigation complexity) are best-effort inferences; broken-link detection and rendered/visual checks (screenshots, mobile layout, console errors) remain deferred behind the `BrowserProvider`; campaign rescoring runs synchronously (fine for bounded campaigns). (The lead-table score-range and service filters now match on effective values, honoring an active manual override — see the Prompt 5 section.)

---

## Evidence-Grounded AI Email Drafting (Prompt 5)

Two-stage, evidence-grounded drafting built on the audit + scoring systems. No email is ever sent; drafts are created for human review.

**Effective-value filter fix (prerequisite).** `src/lib/leads/score-filter.ts` adds `scoreMatchesEffectiveFilters` (pure predicate) and `buildEffectiveScoreWhere` (the matching Prisma filter). The lead table's score-range and service filters now match on the EFFECTIVE value (an active manual override wins over the computed score/service), agreeing with what the table shows. Confidence is not overridable and matches directly. Unit-tested in `score-filter.test.ts`; also asserted in `verify:db` via an overridden score.

**AiProvider (`src/lib/ai/`).** `types.ts` defines the provider contract: `generateStructured` with a JSON-schema tool + a `parse` validator, prompt versioning left to the caller, plus `isConfigured()`. `anthropic.ts` implements it with forced tool use for structured output, retry on transient errors (connection / 408 / 409 / 429 / 5xx), a per-request timeout, and `AiNotConfiguredError` when no key. The model is `AI_MODEL` (default `claude-opus-5`), never a hardcoded unchangeable value; tuning via `AI_TIMEOUT_MS` / `AI_MAX_RETRIES` / `AI_MAX_OUTPUT_TOKENS`. `provider.ts`'s `getAiProvider()` always returns the REAL Anthropic provider (no fake fallback); `fake.ts` (`FakeAiProvider`) is used only by tests and the verify script and is never wired into the app.

**Stage A — strategy (`strategy.ts`).** Deterministic. Reads the effective (override-aware) service and picks the opportunity area(s): Website / Software / KlearQ, Combined only when the top two areas BOTH have citable evidence (else it degrades to the single supported area rather than forcing a combined offer), or Insufficient. Crucially, an override is not evidence: if the chosen service has no citable evidence, the result is Insufficient and the draft is blocked without calling the model.

**Citable evidence (`evidence.ts`).** Only non-dismissed findings at `VERIFIED` or `STRONG_INFERENCE` are citable; weak inferences and unknowns are excluded from what the model may state, so a weak inference can never be written as fact.

**Stage B — generation (`prompts.ts`, `draft.ts`).** Versioned prompt (`draft-v1`) per strategy, carrying org identity, the clinic, and the chosen observations. The model returns subject, body, `observationsUsed`, and a claim-to-evidence mapping via a forced tool call (schema-validated with Zod). The portfolio link is included only for website/combined pitches.

**Hallucination guard (`draft-guard.ts`).** Deterministic, after generation, before saving. Maps each claim to a citable finding; a claim with no evidence, or based on a dismissed finding, blocks the draft. Also blocks on loss/revenue/operational-failure claims without verified evidence, scraping mentions, patient impersonation, an unfilled placeholder, or a dropped clinic name. Warns (does not block) on em dashes, urgency wording, an out-of-band word count, a missing portfolio link, or inference-only wording. `scanContent` is reused to re-validate human edits.

**Persistence (`draft-repository.ts`, schema).** One `EmailDraft` per clinic (unique `clinicId`); each change writes an immutable `DraftVersion` snapshot (generate / regenerate / edit / approve / reject / restore) for history, comparison, restore, and the approval record (final content + evidence set + user + timestamp). `EmailDraft` stores subject, recipient name/email, clinic name, service, body, prompt version, provider + model, evidence ids + source URLs, the claim-to-evidence mapping, confidence, warnings, generation timestamp, status (`GENERATED`/`EDITED`/`BLOCKED`/`APPROVED`/`REJECTED`), version, and a `blockedReason`. New `DraftStatus.BLOCKED`; new `DraftVersion` model; migration `20260801120000_ai_email_drafting`. No new required env vars.

**Server actions + RBAC (`leads/draft-actions.ts`).** Generate/regenerate/edit/reject/restore require MEMBER; approve requires ADMIN. Editing an approved draft returns it to review. All actions surface configuration, blocked, and error states. Bulk drafting (ADMIN) creates a `ResearchJob` (type `draft.bulk`) and starts a runner.

**Durable bulk drafting (`bulk-draft.ts`, `bulk-runner.ts`, `src/inngest/`).** Same durability model as research: a runner-agnostic pipeline over `JobStepRunner` (memoized under Inngest), reusing `chooseRunner` (production requires Inngest, never inline). Resumable, idempotent (one draft per clinic + memoized steps), rate-limited (`DRAFT_BULK_DELAY_MS` between clinics), and isolated (one failing lead logs an error and the batch continues); pause/cancel honored between clinics. The core engine keeps no Inngest dependency.

**UI.** Lead detail `DraftPanel` shows configuration / loading / blocked / error / review / approved / rejected states with generate, regenerate, edit, copy, approve, reject, evidence-used, warnings, and version history + restore. The campaign page adds a "Draft emails" bulk action (disabled with a tooltip when AI is unconfigured).

**Tests + verification.** Unit tests: `score-filter.test.ts` (effective filtering), `strategy.test.ts` (service selection, combined, insufficient, override-not-evidence), `draft.test.ts` (evidence-only, structured-output validation, provider-config failure, prompt-version storage, unsupported-claim + dismissed-evidence rejection, weak-inference wording, name preservation, combined/insufficient, real-provider-not-fake), `bulk-draft.test.ts` (retry idempotency, batch failure isolation, pause/cancel). Full checks pass: `prisma validate`, `typecheck`, `lint` (0 warnings), `test` (113 passing), `build` (all routes + middleware). `verify:db` (real PostgreSQL) extends to Phase 5: a draft is generated through the real Prisma repository with evidence mapping, warnings, provider/model, prompt version, and timestamps; approval records the final content snapshot; editing an approved draft returns it to review; regenerate bumps the version with no duplicate draft row; and a no-evidence lead is stored as `BLOCKED`.

Limitations: drafting requires `ANTHROPIC_API_KEY` (otherwise reported unavailable, never faked); the model call itself is exercised via the provider seam (a fake in tests/verification, the real Anthropic client in the app); bulk drafting's effective-service qualification uses the stored score.

---

## Google Integrations and Follow-Ups (Phase 6)

Built on the approved-draft workflow. No automatic email sending: Gmail integration creates drafts only, and there is no send control anywhere.

**Real-model smoke test (first).** `scripts/smoke-anthropic.ts` (`npm run smoke:ai`) drafts one email for a controlled test clinic through the REAL Anthropic provider against a throwaway embedded Postgres, asserting structured output, evidence-id→finding mapping, guard validation, persistence (provider/model/prompt-version/timestamp), and clear config/API error handling. When `ANTHROPIC_API_KEY` is absent it demonstrates the `AiNotConfiguredError` path and reports **pending** — it never fabricates a result.

**Token encryption (`src/lib/integrations/crypto.ts`).** AES-256-GCM with a random 96-bit IV and the GCM auth tag (tamper-evident). Key from `TOKEN_ENCRYPTION_KEY` (base64 for exactly 32 bytes) read lazily; a clear `TokenEncryptionNotConfiguredError` when missing/invalid. Only the opaque `v1.iv.tag.ct` blob is stored; plaintext tokens are never logged.

**OAuth (`google-oauth.ts`, `google-config.ts`, `scopes.ts`, routes).** One Google OAuth client serves sign-in and integrations. `GET /api/integrations/google/connect` builds the consent URL with `access_type=offline`, `prompt=consent`, and `include_granted_scopes=true` (**incremental authorization**), least-privilege scopes (`gmail.compose`, `calendar.events`, plus identity), and a **signed, cookie-bound `state`** (HMAC over a nonce+timestamp; verified constant-time against an httpOnly cookie, with a freshness window — CSRF + tamper-evidence). `GET /api/integrations/google/callback` validates state, exchanges the code, and stores an encrypted connection. Token exchange/refresh/revoke go through an injectable `fetch`. Refresh is transparent (`google-tokens.ts` `getValidAccessToken`, 60s skew); a rotated refresh token is re-stored; an `invalid_grant` marks the connection revoked and raises `GoogleNotConnectedError`. Disconnect revokes upstream (best-effort) and deletes the stored tokens. Tokens are never returned to the client (only `toPublicConnection`, which omits them).

**Per-user connections (`google-connections.ts`).** Connections are stored **per user within an org** (`@@unique([orgId, userId])`), not one unrestricted org-wide token. An admin may mark one connection as the org's authorized **default sender**; `getUsableConnection` prefers the user's own active connection with the needed scope, else the org default sender.

**Gmail draft creation (`gmail.ts`, `gmail-guard.ts`, `gmail-mime.ts`, `google-api.ts`).** The deterministic guard requires: draft `APPROVED`; a valid public recipient; not do-not-contact; not on the suppression list; no unsubscribe record; and an authorized Google connection. The REST client (`HttpGoogleApiClient`) calls only `users.drafts.create` — there is intentionally no method that touches any Gmail send endpoint. Creation is **idempotent** via `GmailDraftRecord @@unique([emailDraftId, sourceVersion])`: a repeat request for the same approved version returns the existing draft; editing an approved draft bumps the version and returns it to review, so a new Gmail draft requires re-approval. Each record stores the Gmail draft id, connected account, source draft version, recipient/subject, creator/timestamp, status (`PENDING`/`CREATED`/`FAILED`), and any error. On success the lead advances `APPROVED → GMAIL_DRAFT_CREATED` (a new pipeline stage) but is **never** marked contacted (a separate explicit action). The confirm dialog shows the recipient, subject, sender, and final body before creation.

**Follow-ups + Calendar (`followup-actions.ts`, `calendar.ts`).** `FollowUpTask` gains `orgId`, `title`, `priority`, `status` (`PENDING`/`COMPLETED`/`CANCELLED`; overdue is derived), assignee relation, campaign association, `completedAt`/`cancelledAt`, and calendar-sync columns. Overdue and upcoming follow-ups surface as dashboard reminders. Optional Calendar sync is **idempotent** (stores `calendarEventId`; a re-sync updates the same event), cancellation deletes the event, and all calls use `sendUpdates=none` with no attendees, so the clinic is never invited.

**Immutable activity (`IntegrationActivity`).** Append-only records for OAuth connect/reconnect/disconnect/refresh, Gmail draft creation/failure, calendar create/update/cancel, follow-up create/complete/cancel, suppression blocks, and integration errors — never containing tokens. Clinic-scoped events also append to the per-lead `OutreachActivity` timeline.

**Schema.** New `GoogleConnection` (per-user, encrypted tokens, default-sender), `GmailDraftRecord` (idempotent per approved version), `IntegrationActivity`; extended `FollowUpTask`; new `PipelineStage.GMAIL_DRAFT_CREATED` and `ActivityType`/`IntegrationEventType` values; migration `20260801170000_ai_google_integrations` (data-safe: `FollowUpTask.orgId`/`updatedAt` are added nullable, backfilled from the clinic, then set NOT NULL). New env: `TOKEN_ENCRYPTION_KEY` (required to connect Google); `GOOGLE_CLIENT_ID`/`SECRET` now also power integrations.

**Verification.** `prisma validate`, migration (applied + data-safe backfill checked on a table with existing rows), `typecheck` (0), `lint` (0), `test` (**157 passing**, +44 for crypto/OAuth/scopes/guard/MIME/API), `build` (19 routes incl. the two Google routes + middleware), and `verify:db` extended to Phase 6 against real PostgreSQL: token refresh + re-encryption, an `invalid_grant` revocation, approved-only + idempotent Gmail creation (no duplicate, no send), suppression/do-not-contact/edited-approved/org-isolation blocks, calendar create/update/cancel with no attendees, follow-up overdue logic, provider-failure handling, and the immutable integration log.

**Operational test status.** The real-credential Gmail draft test (create one Gmail draft addressed only to a developer-controlled account, not sent) is **pending**: no Google OAuth test credentials are configured in this environment. The full guarded creation path is exercised against real PostgreSQL with a fake Google transport; running it against live Google only swaps `HttpGoogleApiClient` in (already the app default).

**Limitations.** Gmail draft creation and Calendar sync require a connected Google account (unavailable/reported otherwise, never faked); Gmail/Calendar are sensitive scopes needing Google verification for production (test users in dev); idempotency guarantees are strongest for sequential repeats (a `PENDING` record + unique constraint bound concurrent races); unsubscribe is modeled via the suppression list. Automatic sending, CRM export beyond CSV, and email verification remain out of scope.

---

## Phase 7 Implementation Notes (Dashboard, UX, Permissions, Accessibility, Retention)

Production hardening built on the completed Phases 2-6. No provider was faked; credential-dependent operations remain reported as unavailable/PENDING.

**Dashboard (real, override-aware).** `dashboard/page.tsx` replaced the stale "Phase 3/4" placeholder tiles with real organization-scoped counts and charts: total/new leads, high-priority (effective overall score ≥ 70), needs-review, drafts awaiting review (`EmailDraft` GENERATED/EDITED), contacted, responses, follow-ups due, plus leads-by-category, leads-by-stage, recommended-service mix, and a lead-score distribution. Score/service tiles and charts use `buildEffectiveScoreWhere` (from `src/lib/leads/score-filter.ts`) so an active manual override wins over the computed value, matching the lead table. Every figure is a bounded `count`/`groupBy`, never a full-dataset load.

**Lead table + saved views + bulk.** Search, category/stage/score/service/confidence/finding/audit filters, sort, and pagination were already present. Phase 7 added: (a) a stored, indexed `Clinic.normalizedName` (migration `20260801190000`, backfilled to mirror `normalizeName`) so soft-duplicate detection is a bounded `groupBy` on the current page's names instead of loading every clinic name into memory; (b) CSV import dedupe bounded to the import's own keys (`dedupeKey in [...]`) rather than loading all org keys; (c) per-user **saved views** (`SavedView` model, unique `[orgId, userId, name]`) via `SavedViews` + `leads/view-actions.ts`; (d) a **bulk do-not-contact** action (`bulkSetDoNotContact`) that also suppresses public emails, alongside the existing bulk stage change. `normalizedName` is written on every clinic-create path (manual, CSV, research, seed).

**Authorization + isolation.** A full audit of every page, server action, API route, and background job confirmed: every by-id mutation is preceded by an org-scoped ownership check (`ownedClinic`/`ownedDraft`/`ownedFinding`/`ownedFollowUp`/`ownedCampaign`), `orgId` is never read from user input (always from `ctx`), and background jobs derive `orgId` from the job/campaign row — no IDOR or cross-tenant gaps, no missing role checks. The MEMBER-vs-ADMIN split is intentional (per-lead score edits = MEMBER; scoring policy/settings/approve/run = ADMIN). Negative-access tests pin the `roleAtLeast` matrix (`src/lib/auth/roles.ts`, extracted so the pure policy is importable without server-only modules), and `verify:db` asserts cross-organization isolation against real Postgres. Defense-in-depth opportunity (documented, not a current vuln): add `orgId` predicates inside `rescore.ts` / `calendar.ts` / `research/repository.ts` helpers so they are safe even if reused from an unvalidated path.

**Accessibility + responsiveness.** `globals.css` adds a `prefers-reduced-motion` block (near-instant transitions, no looping animation) and a global `:focus-visible` outline. The dashboard layout adds a skip-to-content link and a `nav[aria-label]`, and a collapsible `MobileNav` (keyboard-operable, closes on route change/Escape) replaces the crammed mobile nav. `Field` now associates hint/error with its control via `aria-describedby` and sets `aria-invalid`. Dialogs use Radix (focus trap + restore) and all have a `DialogTitle`. Tables scroll within `overflow-x-auto`; small icon buttons were enlarged to ≥24px tap targets.

**Data retention.** `src/lib/retention/retention.ts` implements the purge: a deterministic cutoff (`now - retentionDays`, `0` disables), `purgeableClinicWhere` (stale + purgeable stage + no active-engagement signal), dry-run counting, batched deletes (`DEFAULT_BATCH_SIZE`, `MAX_BATCHES` backstop), old terminal-job/error-log cleanup, and an immutable `RetentionRun` audit row per run. **Active-record protection**: approved/sent drafts, created Gmail drafts, pending follow-ups, do-not-contact, and engaged stages (approved → meeting-booked, follow-up-later) are never purged. A daily Inngest cron (`retention-purge`) runs it for every org using each org's window; `settings/retention-actions.ts` gives admins a set-window form plus dry-run and confirm-purge controls, surfaced by `RetentionSettings` in Settings. Verified in `verify:db`: dry-run deletes nothing, purge respects protection, re-run is idempotent, disabled window purges nothing, and runs are audited.

**Schema + migrations.** `20260801180000_phase7_saved_views_retention` (adds `SavedView`, `RetentionRun`, `RetentionRunStatus`) and `20260801190000_clinic_normalized_name` (adds + backfills `Clinic.normalizedName` and its `[orgId, normalizedName]` index). Both are additive and data-safe. No new environment variables.

**Verification.** `prisma validate`, all migrations apply, `typecheck` 0, `lint` 0, `test` (181 passing, +24 for retention + role policy), `build` 0, and `verify:db` green (including the Phase 7 cross-org/retention/saved-view block) with no duplicate records.

**Limitations.** Retention has a single per-org day window (not per-entity policies); the scheduled cron only fires where Inngest is configured (production) — locally use the manual controls; saved views are per-user (no org-shared views yet). The live-Google Gmail-draft operational test remains PENDING without OAuth test credentials.

## Requirement Traceability Matrix

Every major requirement block mapped to where it is handled.

| Requirement (spec section) | Plan location |
| --- | --- |
| Website design pitch + portfolio/contact links | Org identity fields (S3), draft templates (S7) |
| Custom software opportunity, evidence-based, no invented problems | Scoring signals (S6), Stage A guardrails (S7) |
| KlearQ signals + careful wording | Static analysis signals (S6), Stage A/B guardrails (S7) |
| Primary objective: discover -> collect -> evaluate -> recommend -> score -> draft -> save -> dashboard -> track | Data flow (S2.4), phases (S15) |
| No automatic sending | Draft-only workflow (S7, S12) |
| Configurable search (categories, geo, radius, min locations, max leads, keywords) | SearchCampaign model (S3), discovery (S6) |
| Data collection fields | Clinic/Contact/Location models (S3), collection (S6) |
| Compliant, no bypassing protections, no patient data | Fetcher rules (S6), compliance (S12) |
| Website evaluation: design, technical, conversion | Static + performance + browser audit (S6), FindingCategory (S3) |
| Every observation: finding, evidence, source, date, confidence | AuditFinding model (S3), evidence system (S6) |
| Neutral, non-insulting wording | Finding wording rules (S6, S7) |
| Lead score 0-100 with category ranges and stored breakdown | LeadScore model (S3), scoring engine (S2, S6) |
| Adjustable scoring weights | Settings + weightsVersion (S3, S8) |
| Verified/strong/weak/unknown, never inference as fact | Confidence enum (S3), Stage A output (S7) |
| Email draft fields + style constraints + strategies + length | EmailDraft model (S3), workflow (S7) |
| Dashboard, lead table, lead detail, pipeline stages | Section 8 |
| Human approval workflow (review, edit, approve, copy, Gmail draft, contacted, follow-up, reply, notes) | Sections 7, 8, 9, 10 |
| Integrations architecture | Provider interfaces (S2.2), Gmail/Calendar (S10) |
| Secrets in env, none hardcoded | Section 11 |
| Database entities (all 18) | Section 3 |
| Research job system (status, progress, retry, rate limit, errors, sources, dedupe, partial, cancel, resume) | Section 5 |
| No single failed website stops a campaign | Failure isolation (S5, S6) |
| Compliance and safety controls | Section 12 |
| Development process phases | Section 15 |
| Acceptance criteria | Section 15 |

---

## Conflicts, Missing Dependencies, Security Concerns, and Unclear Requirements

Conflicts and tensions

- "Vercel-compatible" plus durable background research is a real tension: Vercel serverless has execution-time limits unsuited to long crawls. Resolved by Inngest (durable steps on serverless) with the DB as source of truth. If Inngest is not acceptable, the fallback is a Postgres job queue plus Vercel Cron, which is more code for the same contract.
- Screenshots and console-error detection need a headless browser, which is awkward and paid on Vercel. Resolved by deferring these features (decision 5): the MVP runs basic no-browser checks and marks browser-dependent features unavailable behind the `BrowserProvider` interface, so a hosted provider can be added later without engine changes.
- "Console errors, when safely detectable" and broken-link checks must stay within rate limits and robots rules, so they are best-effort and bounded, not exhaustive.

Missing dependencies (need accounts/keys before Phase 3+)

- Required for MVP: Anthropic API key; Google Cloud project with Places, PageSpeed, and OAuth (Gmail/Calendar) enabled; Neon (or equivalent) Postgres; Inngest account.
- Deferred / optional (features report as unavailable until provisioned): hosted browser provider account; Vercel Blob or S3 (only needed once screenshots are enabled); email-verification account.

Security concerns

- OAuth refresh tokens must be encrypted at rest (`TOKEN_ENCRYPTION_KEY`) and never sent to the client.
- Strict org scoping on every query to prevent cross-tenant data access.
- SSRF risk in the website fetcher: validate and constrain target URLs, block internal/link-local addresses, and cap redirects.
- Rate-limit and cost controls on Places, PageSpeed, browser, and AI calls to avoid runaway spend.
- Gmail/Calendar scopes are sensitive and require Google verification for production use.

Unclear requirements (need user input, tracked as assumptions below)

- The [COMPANY NAME], [PORTFOLIO URL], and [CONTACT URL] placeholders are not filled in. Plan stores them per org as editable settings.
- Preferred external providers (discovery, browser, email verification) are not specified. Plan picks sensible defaults behind interfaces.
- Default scoring weights within each category are not specified. Plan ships a documented default weight set that admins can adjust.
- Single-org vs multi-org from day one is not specified. Plan builds multi-org since the schema requires Organization and permissions.

---

## Decisions Locked In (User-Approved)

These are confirmed and drive the plan:

1. Company name, portfolio URL, contact URL, sender info, and KlearQ info are editable org-level settings, never hardcoded (S3 Organization model, S8 Settings, S11).
2. All discovery, browser, email-verification, AI, and email providers sit behind interfaces; each default provider, its cost, env vars, and usage limits are documented in Section 2A.
3. Inngest runs background research/crawl jobs, with the research engine kept independent of the runner so it can move to a Postgres-backed queue later (S5).
4. A documented default scoring model ships, with weights stored as editable org settings and the breakdown plus contributing rules shown per score (S6A, S8).
5. The paid hosted-browser dependency is deferred; the browser-audit layer is an interface with basic no-browser checks in the MVP, and screenshots, rendered mobile audits, and console-error inspection are clearly marked unavailable until a hosted-browser provider is configured (S2A, S6).
6. No fake fallback results when credentials are missing; the app shows a clear configuration warning naming the unavailable functionality (S2B).

## Deferred Features (MVP Scope)

Deliberately out of the initial build, each behind an interface so it can be turned on without reworking the engine:

- Hosted-browser features: website screenshots, rendered mobile-layout audit, and console-error inspection (default `NullBrowserProvider`; enable by setting `BROWSER_PROVIDER` and its key).
- Email verification (default `NullEmailVerifier`; enable by setting `EMAIL_VERIFIER` and its key). Until then contact emails remain `UNVERIFIED`.
- Automated email sending. v1 creates Gmail drafts only; any future sending is gated behind explicit approval plus daily limits, suppression enforcement, unsubscribe handling, and audit logs (S12).
- CRM export beyond CSV (interface stub only in Phase 5).

## Remaining Assumptions

Proceeding on these unless told otherwise:

1. Multi-tenant from the start (Organization + roles), since the spec lists both User and Organization and requires org permissions.
2. AI default is `claude-opus-5` (overridable via `AI_MODEL`); discovery is Google Places; performance is Google PageSpeed; storage is Vercel Blob (only exercised once screenshots are enabled).
3. Gmail integration is draft-creation only in v1.

## Inputs Still Needed From the User (not blocking; can be entered in-app)

These do not block starting Phase 2, because they are org settings entered through the UI rather than code:

1. Actual company name, portfolio URL, contact URL, sender identity, and KlearQ product details (entered in Settings; defaults are empty with a prompt to fill them).
2. Preferred alternative providers, if any, for discovery / browser / email verification (defaults documented in S2A are used otherwise).
3. Target countries/regions for the first campaigns (affects compliance-notice wording and Places usage).
4. Approval of the default scoring weights in Section 6A, or adjustments (editable in Settings at any time).

The plan is now internally consistent and reflects all approved decisions. Per the spec's Development Process, major implementation begins only after this plan is complete, which it now is; Phase 2 can start on request.
