# Katalyst website redesign — approved product brief

Status: **Phase 1 complete (discovery).** Every statement below is verified against
the codebase. Agents working from this file must not add product claims that are
not in it. If something you need is missing, report it as a blocker instead of
inventing it.

---

## 1. Product truth

**One line:** Katalyst discovers healthcare clinics through the Google Places API,
crawls their public websites to produce evidence findings, scores each clinic with
a deterministic rule engine, uses Claude to write an outreach email grounded in
that evidence, blocks any draft containing a claim the evidence cannot support,
and — on human approval — creates a **draft in the user's own Gmail**. It never
sends.

**Who the buyer actually is.** The current site never says, and that is its single
biggest failure. Two verified audiences:

1. **Primary — a B2B services vendor or agency selling to healthcare clinics.**
   (`service_pitch`, the default use case.) Evidence: the three pitchable scoring
   categories are WEBSITE, SOFTWARE and KLEARQ — the *seller's* offerings; the
   seeded dev user is `founder@example-clinic-sales.test`.
2. **Secondary — a healthcare provider seeking referral relationships.**
   (`patient_referral`.) A provider introduces their practice to other providers
   who may refer patients to them.

The visitor must be able to recognise themselves in under five seconds.

### 1a. The referral question — settled

The stakeholder brief asks to position Katalyst as a *referral system management
platform* with intake → assignment → tracking → follow-up → completion → reporting.

**That product does not exist in this codebase.** `grep -ni referr prisma/schema.prisma`
returns zero matches. Point by point:

| Proposed stage | Reality |
|---|---|
| Intake | No inbound channel of any kind. Only `gmail.compose` scope is requested; there is no read scope, webhook, form, API route, HL7/FHIR or EHR integration. |
| Assignment | No referral entity exists. The only assignable record in the schema is `FollowUpTask.assigneeId` — an internal reminder about a sales lead. |
| Tracking | `PipelineStage` is an outbound sales funnel (DISCOVERED to MEETING_BOOKED/DISQUALIFIED). Every stage past GMAIL_DRAFT_CREATED is set by a human choosing it from a dropdown. |
| Follow-up | A manual to-do with an optional Calendar event. Nothing fires on a schedule. |
| Completion | Only `FollowUpStatus.COMPLETED` on that internal task. |
| Reporting | Lead counts by stage, score bucket and category. No referral volume, source, turnaround or acceptance rate. |

Two traps that look like referral management and are not:

- Scoring rule `sw_referral_workflow` (`src/lib/scoring/rules.ts:36`) awards points
  when **the prospect's** website suggests *they* run referrals manually. It is a
  signal that they are a good target to sell software to.
- The healthcare preset's "Referral access" offering is disabled-by-default **pitch
  guidance** — prose for the email body, not an intake mechanism.

**Decision:** the site is positioned on the verified product. `patient_referral` is
promoted from a buried setting to a visible, named use case, so a provider
audience is served honestly. No referral-management workflow is depicted anywhere.

---

## 2. The verified workflow (the only workflow the site may show)

| # | Stage | Who acts | What actually happens |
|---|---|---|---|
| 1 | Set up | Human | Sender identity, company profile, email voice, AI profile (offerings, use case, guardrails). Can be inferred from a URL, then confirmed. |
| 2 | Create campaign | Human | Categories, city/region, radius, min locations, max leads, required/excluded keywords. |
| 3 | Discover | Automatic | Google Places API text search per category, over-fetches 3x, filters on keywords and location count, dedupes. Surplus candidates are kept as **reserves** to replace clinics that later fail. |
| 4 | Research | Automatic | Robots-respecting crawl of the public site: contact email/phone, booking method and platform, service pages, locations, social links. Optional PageSpeed audit. Produces neutral findings across 5 categories, each with a confidence level and a source URL. |
| 5 | Score | Automatic | Pure function. ~34 named rules; points scaled by confidence (verified 1.0 / strong 0.75 / weak 0.5); per-category caps; clamped 0-100. Full breakdown stored, rejected findings included. All weights org-editable. |
| 6 | Adjust (optional) | Human | Dismiss or add findings, override a score. Every change needs a written reason and is appended to an immutable log. |
| 7 | Draft | Human triggers | Stage A is model-free: if there is no citable evidence the draft is BLOCKED **without calling the model**. Stage B forces a tool call requiring a claim-to-evidence mapping for every factual statement. |
| 8 | Guard | Automatic | `validateDraft` blocks a draft citing missing, insufficient or dismissed evidence; also blocks loss/revenue claims, references to how data was gathered, impersonation, unfilled placeholders, and (on referral outreach) PHI. |
| 9 | Review | Human | Queue with tabs Needs review / Blocked / Approved / Rejected. `j`/`k` to move. Per-draft confidence, version, word count, warnings. |
| 10 | Approve | Human (ADMIN) | Creates a **Gmail draft** in the connected account. Blocked drafts cannot be approved. Do-not-contact, suppression and duplicate-mailbox checks run here. Creating the draft does **not** mark the lead contacted. |
| 11 | Send | Human, in Gmail | Outside the product entirely. |

---

## 3. Claims that are provable (use these; they are the differentiators)

- Katalyst never sends an email. It creates a draft in your own Gmail and you press send.
- Every factual statement about a prospect maps to stored evidence with a source URL; a draft that cannot map a claim is blocked rather than saved.
- When research finds nothing supportable, the AI is never called at all.
- A draft that cites a finding a human dismissed is blocked.
- A blocked draft cannot be approved. Approval requires an Admin role.
- Scoring is deterministic and inspectable — the same findings and configuration always produce the same score, and every point traces to a named rule and the evidence that fired it.
- Weak evidence cannot score like a verified fact.
- Scoring weights, caps, multipliers and thresholds are editable by an org admin.
- Every manual change to a finding or score requires a written reason and is appended to a log that is never updated or deleted.
- On provider-to-provider outreach, an email referencing protected health information is blocked, not flagged.
- Contacting the same mailbox twice through two different leads is blocked.
- Approving the same draft version twice never creates a duplicate Gmail draft.
- Discovery uses the official Google Places API, not scraping; website reading honours robots rules.
- If a provider is not configured, the app says so instead of inventing data.
- Research survives interruption; one unreachable website never stops a run.
- A campaign asked for 40 leads draws on reserves to replace clinics whose research failed, rather than quietly finishing short.
- Google tokens are encrypted at rest and only least-privilege scopes are requested.
- Every draft edit is versioned with who, when and why, and any version can be restored.
- Each campaign shows an estimated cost before it runs.

## 4. Anti-invention list — never imply any of these exist

Referral management of any kind · referral intake, assignment, tracking or
reporting · sending email · reply detection · open/click/bounce tracking ·
drip sequences or cadences · email verification · HIPAA compliance or a BAA ·
any clinical feature (patients, appointments, scheduling, charts, insurance) ·
telephony or voice AI · discovery sources other than Google Places · autonomous
agents · learning from outcomes · multi-channel outreach · A/B testing ·
billing or plans · Slack or email notifications · a public API, webhooks or a
mobile app · customer logos, testimonials, counts or performance statistics.

---

## 5. What is wrong with the current site

847 words, one page, nine sections.

**Comprehension failures**

1. The page never names the customer. "You" appears ~15 times with no antecedent, and "Katalyst finds healthcare clinics" reads most naturally as *a tool for clinics* — the opposite of the truth.
2. The problem is never stated, so the solution has nothing to land against. Nowhere does it say that AI outreach tools invent things, or that researching clinics by hand does not scale.
3. The score has no scale. "78" appears three times; out of what is never said.
4. WEB / PHO / SW / Con / Fit are never expanded.
5. "Findings" is used as a defined term before it is defined — and its definition sits behind a 4.2s autoplay the visitor may never see.
6. The bottom CTA offers a "seeded development workspace" that cannot exist in production.
7. The page never discloses that access is allow-listed, while three CTAs say "Get started".

**Generic AI design patterns to remove**

- Decorative 56px grid background behind the hero (`landing.tsx:193`) — the radial glow redrawn as squares.
- Arbitrary 01/02/03 section numbers on three of nine sections, colliding with the pipeline's own 01-05 rail.
- Nine uppercase-mono kicker labels. Keep mono **only inside product mocks**, where it reproduces real app chrome.
- Decorative metadata strip under the hero CTAs — three slash-separated compressions of sentences read four lines earlier.
- The stat strip: none of the three numbers is a measurement. "5" is the length of an enum; "0 emails sent" is definitionally zero; "100%" restates the guard. All three are CountUp-animated to perform as if measured. **Cut the band.**
- Rule-of-three constructions four times over (h1, metadata strip, bullets, stats, guarantee).
- Symmetric heading+paragraph blocks: the four-item capability list and the five-item pipeline rail are the icon-free variant of the icon+heading+paragraph grid.
- A repeated reassurance footnote closing four of five pipeline stages.
- The "guarantee" section is the tenth restatement of "it never sends".

**Navigation and IA problems**

- Brand split: the landing page says **Katalyst**, while `layout.tsx:16` metadata and the running app header say **Outreach Agent**.
- Below 640px both nav links are `hidden sm:inline` with no hamburger or fallback. The mobile header is a wordmark and a button.
- `#review` and `#guarantee` are anchors nothing meaningful links to.
- The 404 page's only link is `/dashboard`, which bounces a signed-out visitor to `/signin`.
- No SEO or social metadata, no `metadataBase`, no OG image, no icons.
- No privacy policy, terms or contact route — while the app requests Gmail and Calendar OAuth scopes.
- `/signin` does not redirect an already-signed-in visitor.
- A refused sign-in is silent: `SIGN_IN_REFUSAL_MESSAGES` exists and is imported by nothing.
- The page asserts "Each panel below is a screen from the app" — they are hand-built marketing markup. Either make that true or stop claiming it.

---

## 6. Real product surfaces available for demonstration

Verbatim UI strings, confirmed from the running app and from source. Use these;
do not invent labels.

- **Dashboard** — "Pipeline at a glance"; tiles Total leads / High priority ("Score 70 or higher") / Drafts awaiting review / Follow-ups due; New leads, Needs review, Contacted, Responses; "Campaign conversion", "Weekly lead intake".
- **Leads** — "Clinics in your outreach pipeline."; New lead / Export / Import; "Pipeline health" band with Total, Strong, Contacted, New this week; columns **Clinic · Overall · Performance profile · Service and confidence · Findings**; service chips Combined / Website / Phone operations / None; confidence High / Med / Low.
- **Campaign detail** — "Discovery criteria, research runs, and the leads this campaign found."; "Everything checks out. Review the cost and launch when you are ready."; "Review and launch".
- **Review and launch** — "Everything this campaign will do, before it does it. Nothing is sent from here."; Leads in campaign / Will be drafted / Will be skipped / Already approved; estimated cost.
- **Review drafts** — "Work through generated emails one at a time. Nothing is sent from here."; tabs **Needs review · Blocked · Approved · Rejected**; "j / k to move"; per draft: Confidence n/100, Version v1, Length n words; a "Review warnings" panel, e.g. *"Wording rests on inference-level evidence; verify before sending."*
- **Lead detail** — "Clinic overview", Website / Main phone / Public email / Contact page; "Do not contact" banner.

App shell visual language (match it exactly): dark Fluent tokens already mirrored
in `src/components/marketing/theme.ts`; radii on a 2/4/6px ramp and nothing above
6px; hairline borders `rgba(255,255,255,0.085)`; brand `#479ef5`; the body face is
the app's Segoe stack; `Archivo` is display-only and scoped to the marketing subtree.

---

## 7. Hard constraints

1. **Preserve functionality.** `src/app/page.tsx` redirects signed-in users to `/dashboard`. Sign-in, auth and middleware behaviour must not change.
2. **No new dependencies.** Tailwind v4, lucide-react and next/font are already present.
3. **Dark-locked marketing surface.** It does not follow the app theme toggle; `SCOPE` in `theme.ts` re-pins the Fluent variables for the subtree. Do not remove it — the brand mark disappears without it.
4. **Accessibility.** Reveals must degrade: content stays readable with JS off and under `prefers-reduced-motion`.
5. **Mobile is a first-class target**, not a shrink.
6. **No invented numbers, logos, testimonials or customer counts.**
7. One owner per file during implementation. The Lead implements; planning agents produce specifications, not code.

## 8. Open decision for the stakeholder (do not resolve by inventing)

Production sign-in is allow-listed or closed to new registration, yet every CTA
says "Get started". A truthful site needs either a real access-request route or
different CTA wording. No contact address exists in the codebase, so **no agent
may invent one.** Specify the CTA pattern; leave any address as a placeholder for
the stakeholder to fill.
