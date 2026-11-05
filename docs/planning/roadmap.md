# Roadmap and current state

Last reviewed: 2026-11-04.

This is the living planning document. [`build-plan.md`](build-plan.md) is the
original phased plan and is kept as written; where the two disagree, this file
is current.

## Where the project is

The product works end to end locally: discover → research → score → draft →
guard → review → approve → Gmail draft. The local workspace has roughly 115
leads, 76 drafts and 5 campaigns, which is enough real data to have surfaced
several bugs that synthetic data did not.

The public marketing site has been rebuilt against a full audit of the
product (see
[`../decisions/marketing-site-redesign.md`](../decisions/marketing-site-redesign.md)).

**It has never been deployed.** Everything below under *Blocking a public
launch* is genuinely blocking, not nice-to-have.

## Active workstream

**[Physician-level outreach](physician-outreach.md)** — moving from emailing
clinic general inboxes to identifying and contacting the people who make
decisions for those clinics. **Phases 1-3 and most of Phase 5 are built** (schema, team extraction, role classification,
identity resolution, affiliation evidence, lead-detail UI). All four decisions (D1-D4) are settled, so
Phase 4 is unblocked. CPSO verification (P2.5) was deferred, which is why
identity resolution refuses to merge on a name alone. Addresses are never
inferred (D4), so clinic-published addresses are the only source and coverage
will be thin by design. The audit in that document found the read path
is already built (draft recipient selection prefers a decision-maker contact)
while nothing populates it, and that `hasDecisionMakerEmail` is hardcoded
`false` at `src/lib/research/enrich.ts:117`, so a 4-point scoring rule has
never fired.

## Blocking a public launch

| Item | Why it blocks |
|---|---|
| **Privacy policy and terms pages** | The app requests Gmail and Calendar OAuth scopes. Google's verification requires both URLs. Neither route exists, and neither should be written by guesswork — they describe real data handling. |
| **Hosting and database decisions** | Not yet made. `embedded-postgres` is a devDependency and cannot run on a serverless host. See [`../deployment.md`](../deployment.md). |
| **Inngest app sync** | Production refuses to run campaigns without it. If the app is not synced after deploy, `inngest.send()` succeeds and the job sits `QUEUED` forever. This is the most common silent failure. |
| **OAuth consent screen verification** | While it is in *Testing*, refresh tokens expire after 7 days and the Gmail connection quietly stops working each week. |
| **Rotate the secrets in `.env`** | Correctly gitignored and never committed, but it sits in a OneDrive-synced folder and holds five live keys. |

## Open, non-blocking

- **`ACCESS_CONTACT` is `null`** in `src/components/marketing/access.ts`. No
  contact address exists anywhere in the codebase and none was invented. Set
  it and a "Request access" button appears on the landing page; until then the
  page states that access is by invitation and offers sign-in only.
- **No Open Graph image.** `metadataBase` and the card metadata are wired, so
  the card is `summary` rather than a blank large slab. Add
  `src/app/opengraph-image.*` once a real 1200×630 asset exists.
- **`NEXT_PUBLIC_SITE_URL` is read directly from `process.env`**, not through
  `src/lib/env.ts`. It falls back to localhost rather than throwing, so a typo
  degrades social tags instead of taking the deployment down, but it should be
  declared in the schema.
- **Marketing a11y polish.** `SegmentedTabs` is announced as a tablist but
  lacks the arrow-key pattern and `aria-controls`. `LINE_STRONG` borders are
  1.52:1 against a 3:1 requirement for control boundaries. The mobile menu has
  no Escape or outside-click dismissal.
- **Marketing visual drift.** The figure components were authored in parallel
  and differ slightly in panel ground, title size and row padding. They should
  converge on one set.
- **Middleware matcher drift.** `src/middleware.ts` does not list `/review`,
  `/help` or `/tutorial`. Those routes are still protected, because
  `requireOrgContext()` guards the whole `(dashboard)` group server-side, so
  this is defence-in-depth only — but the two should agree.
- **`ensureMemberships` is not idempotent**, so a duplicate-org race is
  possible on concurrent first sign-in.
- **A stale Prisma pool 500s the first dashboard load** after a restart. A
  retry around the initial queries would make it self-recover.
- **`allowDangerousEmailAccountLinking: true`** auto-links any Google account
  to an existing user with the same address.
- **Per-domain crawl pacing lives in process memory**, so it does not hold
  across serverless instances.
- **The retention cron purges every org inside one durable step**, unbounded
  against the same function timeout.
- **Google sign-in tokens are stored unencrypted** in `Account`, while
  integration tokens are encrypted.

## Deferred by decision

- **Streaming step-by-step workflow UI.** The job surface shows status and
  progress; it does not stream each step as it happens.
- **The feedback loop.** `OrgAiProfile.learned.styleNotes` is read by the
  prompt and never written. Nothing learns from outcomes, and nothing should
  start to without a deliberate decision, because it changes what the model is
  grounded in.
- **Rendered screenshots.** `WebsiteAudit` has `screenshotKey` columns and a
  `BrowserProvider` exists, but no hosted browser is required and visual
  checks stay behind that deferred provider.

## Not being built

Recorded so they are not re-proposed. None of these exist, and the public site
must not imply they do.

Referral management of any kind (intake, assignment, tracking, reporting) ·
sending email · reply detection · open/click/bounce tracking · drip sequences ·
HIPAA compliance or a BAA · any clinical feature · telephony · autonomous
agents · multi-channel outreach · A/B testing · billing · a public API or
mobile app.

Two entries moved off this list when the physician-outreach work was proposed,
and are now **under consideration rather than decided**: additional discovery
sources beyond Google Places, and email verification. Additional sources are now settled by D1: clinic
websites plus the CPSO register for verification only, and CPSO publishes no
email addresses. Email verification remains open under D4. Neither exists yet,
and the public site must not imply they do.

On referrals specifically: `patient_referral` is a **prompt preset** for a cold
introduction email between providers. It is not a referral workflow. See
[`../decisions/marketing-site-redesign.md`](../decisions/marketing-site-redesign.md) § 1a
for the evidence, including that `grep -ni referr prisma/schema.prisma` returns
nothing.
