# Physician-level outreach: implementation plan

Status: **not started.** Source:
[physician-outreach-proposal.md](physician-outreach-proposal.md).

The shift: instead of finding clinics and emailing their general inboxes, find
the people who make decisions for those clinics and reach them directly.

## How to use this document

Work items are `P<phase>.<step>`, for example `P2.1`. Each has an owner-facing
**goal**, the **files** it touches, and **done when** criteria that are
checkable rather than vague. Tick the box when the criteria hold.

Steps inside a phase may run in parallel unless a **needs** line says
otherwise. Phases are ordered by dependency, not by preference.

Before any code: the four items under *Decisions required first* are blocking.
Three of them are product or legal calls that are not mine to make, and getting
one wrong is expensive to unwind.

---

## What already exists (verified, not assumed)

The proposal reads as if this is a new branch grafted onto the side. It is
closer to **finishing something half-built**. Checked against the code:

| Thing | State | Where |
|---|---|---|
| `Contact` model with `name`, `jobTitle`, `email`, `isDecisionMaker`, `sourceUrl` | Exists | `prisma/schema.prisma:285` |
| Draft recipient selection already prefers a decision-maker | **Already wired** | `src/lib/ai/draft-repository.ts:77` — `contacts.find(c => c.isDecisionMaker) ?? contacts[0]` |
| Lead detail, campaign view, CSV export all order contacts by `isDecisionMaker` | **Already wired** | `leads/[id]/page.tsx:87`, `campaigns/[id]/page.tsx:77`, `api/leads/export/route.ts:45` |
| Scoring rule `contact_decision_maker_email`, 4 points, requires VERIFIED | Exists but **dead** | `src/lib/scoring/rules.ts:53` |
| `hasDecisionMakerEmail` | **Hardcoded `false`** | `src/lib/research/enrich.ts:117` |
| `EmailStatus` enum: `UNKNOWN / VALID / INVALID / RISKY / UNVERIFIED` | Exists, nothing ever sets it | `prisma/schema.prisma:277` |
| Anything that creates a `Contact` from research | **Does not exist.** Only manual entry does | `leads/actions.ts:419` |

So the read path is built and the write path is missing. `enrich.ts:117`
passing a literal `false` is why a 4-point scoring rule has never once fired.
Phase 2 is mostly about making that line true.

## The thing the proposal does not account for

**Personalizing on a person collides with the hallucination guard.**

`validateDraft` requires every factual claim about the recipient to map to a
stored `AuditFinding`, which is attached to a *clinic*. Proposal Step 6 asks
for emails reflecting "the physician's professional role, relevant clinic
affiliations, and the specific operational problems our product can address."
Every one of those is a factual claim about a person, and today there is no
evidence record that can support one. The guard will block those drafts — and
that is the guard working correctly, not a bug to route around.

So person-level evidence has to exist **before** person-level personalization
is attempted. That is why `P3` (affiliations as evidence) comes before `P6`
(personalized generation), and why there is no shortcut where we simply pass
the physician's name into the prompt.

The invariant stands: [architecture.md §
Invariants](../architecture.md#invariants-do-not-break-these). Guardrails may
only add restrictions. Nothing here relaxes the guard.

---

## Decisions required first

These block `P2` onward. They are listed as questions because the answers are
yours, not mine.

- [x] **D1 — Which sources may we read?** **DECIDED 2026-11-04: the clinic's own
      website, plus the CPSO public register for per-physician verification
      only.** No bulk extraction, no enumeration, no LinkedIn, no paid vendor.
      Critically, **CPSO publishes no email addresses**, so it answers *who
      someone is* and cannot answer *how to reach them* — which is why P4
      narrows to clinic-published addresses. See
      [the decision record](../decisions/physician-outreach-data.md).
- [x] **D2 — Do we store personal data about named individuals?** **DECIDED
      2026-11-04: yes — business contact information *and* a richer
      professional profile, stored in two tiers split by legal basis.**
      PIPEDA s.2(1) expressly includes a "work electronic address" in business
      contact information, and s.4.01 excludes Part 1 for it when used *solely*
      to communicate with the person about their profession. Bio, publications
      and interests fall outside that list, so the enrichment tier very likely
      sits outside the exclusion. **That risk was accepted deliberately**, and
      the mitigation is a schema requirement: enrichment lives in its own
      table so it can be dropped without breaking outreach. See
      [the decision record](../decisions/physician-outreach-data.md).
- [x] **D3 — Does CASL change what we may send?** **DECIDED 2026-11-04: no
      CASL-specific requirements are enforced by the draft guard.**
      The drafts-only decision bounds this: a commercial electronic message is
      sent by the operator from their own mailbox, so the CASL obligations
      attach to them and are discharged by their own signature, footer and
      mail-client setup. The product produces draft content for a human to
      review and send; it is not the sender.
      **What this does NOT change:** the existing suppression list,
      do-not-contact handling, and the guard's refusal to ship unfilled
      placeholders or a draft that omits the organization's exact name all
      stay. Those are independent of CASL.
      **Accepted risk:** a draft can therefore be approved without an
      unsubscribe line, and the operator is responsible for adding one where it
      is required. The public site already states that responsibility. If this
      is revisited, the cheapest form is a guard warning rather than a block,
      since the operator edits before sending anyway.
- [x] **D4 — May we ever guess an email address?** **DECIDED 2026-11-04:
      never.** Pattern inference (`first.last@clinic.ca`) is how most tools do
      this, and it is not done here. An address is stored only when the clinic
      published it; otherwise nothing is stored and the lead falls back to the
      clinic's general inbox.
      Already enforced in code: `findPublishedEmail` in
      `src/lib/people/extract-team.ts` reads only a `mailto:` the clinic
      printed, with a test named *"never infers an address from a name"*.
      **Accepted consequence:** with CPSO deferred and no vendor permitted,
      clinic-published addresses are the only source, so coverage will be thin
      and many leads will keep going to the general inbox. That is the honest
      cost of the decision, not a defect to engineer around.

**All four decisions are settled** (D1 and D2 on 2026-11-04, D3 and D4 the
same day). Phase 4 is unblocked.

---

## Phase 1 — Assessment

The audit in *What already exists* is most of this phase. What remains is
deciding the shape of the data.

- [x] **P1.1 — Decide: extend `Contact`, or add a `Person` model.**
      `Contact` is keyed to one `clinicId`, so a physician who practises at
      three clinics becomes three unrelated rows with no way to know they are
      the same person. Proposal Step 3 (affiliations) is impossible without a
      person entity and a join table.
      **Settled by D2:** new `Person` + `PersonAffiliation(personId, clinicId,
      role, ownership, confidence, sourceUrl)`, leaving `Contact` alone as the
      per-clinic mailbox record. Migrating `Contact` in place would break the
      read paths that already work.
      **Plus a separate `PersonProfile` table** for the enrichment tier (bio,
      publications, interests). Severability is now a schema requirement, not a
      preference: enrichment must be droppable in one migration without
      touching the contact path. Do not put these fields on `Person`.
      Record **who published** each contact field where determinable.
      *Done when:* the model is drawn up and matches the two-tier split.

- [x] **P1.2 — Decide how person evidence is represented.**
      Either add a `PERSON` value to `FindingCategory` and reuse `AuditFinding`,
      or add a parallel `PersonFinding` table. Reusing `AuditFinding` means
      person claims flow through `validateDraft` unchanged, which is the main
      argument for it; it also means person findings land in clinic scoring
      unless excluded, which is the main argument against.
      *Needs:* P1.1. *Done when:* chosen, with the effect on `scoreClinic`
      stated explicitly. Note D2's consequence: anything from the enrichment
      tier used to personalize a draft must become a finding with a source, or
      `validateDraft` blocks the claim.

- [x] **P1.3 — Write the decision record.**
      [`docs/decisions/physician-outreach-data.md`](../decisions/physician-outreach-data.md)
      covers D1 and D2 with sources. D3 and D4 still need one, and P1.1/P1.2
      should be appended as a second record once chosen.

## Phase 2 — Physician identification

Goal: for a researched clinic, produce named people with roles, each backed by
a source URL. No email addresses yet.

- [x] **P2.1 — Schema migration for `Person` and `PersonAffiliation`.**
      *Files:* `prisma/schema.prisma`, a new migration.
      *Needs:* P1.1. *Done when:* `npm run db:migrate` applies cleanly and
      `npm run verify:db` still passes.

- [x] **P2.2 — Extract a clinic's team from its own site.**
      Extend the existing crawl rather than adding a new one: `extract.ts`
      already fetches and parses the site. Target the "our team" / "about" /
      "providers" pages and pull name, stated role, and the page the name was
      found on.
      *Files:* `src/lib/research/extract.ts`, `src/lib/research/types.ts`.
      *Done when:* given fixture HTML for three real clinic sites, it returns
      the right people with roles and source URLs, and returns an empty list
      rather than guesses when the site has no team page.

- [x] **P2.3 — Classify decision-making authority.**
      Map a stated role to a confidence level. "Owner", "Medical Director",
      "Founder" are `VERIFIED` when printed on the clinic's own site;
      "Lead Physician" is a `STRONG_INFERENCE`; an unqualified physician
      listing is `WEAK_INFERENCE` at best.
      *Done when:* classification is a pure, unit-tested function, and the
      confidence levels it emits are ones `buildAuditFindings` actually
      assigns, so the scoring engine can consume them.

- [x] **P2.4 — Persist people and wire `hasDecisionMakerEmail`.**
      Write `Person` rows and, where a role implies authority, flip
      `enrich.ts:117` from the hardcoded `false` to the real value.
      *Files:* `src/lib/research/enrich.ts`, `src/lib/db/repository.ts`.
      *Done when:* `contact_decision_maker_email` fires on a real run for the
      first time, and `sample-lead.test.ts` has been reviewed — this changes
      scores, so the pinned public number may move deliberately.

- [~] **P2.5 — CPSO verification. DEFERRED 2026-11-04 by decision.**
      Not essential to the task, and it would have meant automated querying of
      a regulator's site whose terms are silent on it. D1 still permits CPSO
      for per-record verification if this is revived.
      **Consequence, handled:** this was going to be the corroborating signal
      for P3.1, so identity resolution now relies on a published address or a
      shared site instead, and refuses to merge on a name alone.
      *Original scope below, kept for whoever picks this up.*

      <details><summary>Deferred scope</summary>

      For each physician found on a clinic site, query the CPSO public register
      by name to confirm they are licensed, and to capture specialty, Ontario
      hospital affiliations and registration status. Per-record only: no
      enumeration, no bulk extraction, no mirror of the register. Rate-limited
      in line with the existing per-domain crawl pacing, provenance stored, and
      the status treated as a snapshot with a timestamp rather than a fact.
      *Needs:* P2.2. *Done when:* a verified physician carries a CPSO-sourced
      specialty and affiliation list with source URL and fetch time, an
      unverifiable name is recorded as unverified rather than dropped or
      guessed, and the lookup is covered by tests against fixtures rather than
      the live register.
      </details>

## Phase 3 — Affiliation mapping

Goal: know when one person is attached to several clinics. This is the step
that creates the "introduce us across multiple locations" lead.

- [x] **P3.1 — Person identity resolution.**
      The hard part. "Dr. Sarah Chen", "S. Chen MD" and "Sarah Chen" may or may
      not be one person, and merging two real people is worse than failing to
      merge one. Name normalization plus at least one corroborating signal
      (shared clinic group, shared domain, a directory record).
      **Built in `src/lib/people/identity.ts`.** With P2.5 deferred there is no
      register number to lean on, so a match requires corroboration: the same
      published address, or the same name on a site already associated with the
      person. A bare name match creates a second record, deliberately. Replaced
      the naive name-only merge written in P2.4.
      `normalizePersonName` is separate from `normalizeName` in `leads/dedupe`,
      which strips words like "medical" and "health" because it normalises
      business names and would mangle a person called Sarah Health.

- [x] **P3.2 — Affiliation findings as evidence.**
      **Built in `src/lib/people/findings.ts`**, persisted as `PersonFinding`
      rows on every save. Emits `person_stated_role`, `person_owns_practice` and
      `person_multi_clinic`. Confidence carries through from the role
      classification, so a stated directorship is a fact and an inferred lead
      role is not; multi-clinic is always an inference because no single page
      states it. Findings are re-derived from every affiliation a person holds,
      not just the clinic being saved, and upserted on `(personId, code)`.
      *Remaining for P6:* merging these into `citableByCode` so a draft may
      actually cite them. The shape already matches what `validateDraft` reads.

- [x] **P3.3 — Surface multi-clinic people in the UI.**
      **Built as `src/components/app/decision-makers-card.tsx`**, rendered on
      the lead detail page under Clinic overview. Shows each person, their role
      and its confidence, the published address or an explicit "None published.
      Never inferred.", the source page, and links to their other clinics. The
      card states provenance and confidence rather than implying them, because
      both decide whether an operator should act on the lead.

## Phase 4 — Contact discovery and verification

Goal: a real, attributable professional email, or nothing.

- [ ] **P4.1 — Discovery against the permitted sources only.**
      **D1 narrows this sharply.** CPSO publishes no email addresses, and no
      vendor or LinkedIn is permitted, so a clinic publishing the address on
      its own site is effectively the only source. Expect real coverage gaps,
      and expect the clinic general inbox to stay the fallback for many leads.
      That is an accepted outcome, not a failure to engineer around.
      *Needs:* D4. *Done when:* every stored address carries its `sourceUrl`
      and, where determinable, who published it; no address is ever synthesized
      from a name pattern; and a lead with no personal address falls back to
      the existing clinic-level path rather than being skipped.

- [ ] **P4.2 — Make `EmailStatus` mean something.**
      The enum exists and nothing sets it. Decide what `VALID` requires:
      syntax plus MX is cheap and weak; a verification provider is a cost and
      a vendor decision.
      *Done when:* a status is set on every discovered address and the basis
      for `VALID` is documented.

- [ ] **P4.3 — Extend the Gmail guard for people.**
      `gmail-guard.ts` already blocks reaching the same mailbox through two
      leads (`already_contacted`). Person-level outreach adds a new case:
      drafting to Dr. Chen *and* to her clinic's general inbox, or to the same
      physician through two different clinics.
      *Files:* `src/lib/integrations/gmail-guard.ts`.
      *Done when:* both cases are blocked with a message that says which other
      lead already has outreach, and both have tests.

- [ ] **P4.4 — Retention and deletion for people, both tiers.**
      The existing `retentionDays` purge is clinic-shaped, so person records
      would otherwise outlive the leads they were collected for.
      *Done when:* the purge covers `Person`, `PersonAffiliation` and
      `PersonProfile`; a single named person can be deleted on request across
      all three; and the enrichment tier can be dropped wholesale in one
      migration, which is the D2 mitigation and should be proven, not assumed.

## Phase 5 — Scoring decision-makers

- [x] **P5.1 — Decide: generalize `scoreClinic`, or add `scorePerson`.**
      `scoreClinic` is pure, category-capped and heavily tested, and the public
      marketing page runs it live to print a worked example. Generalizing it is
      a change to the most load-bearing function in the codebase.
      **DECIDED 2026-11-04: a separate `scorePerson`**, built in
      `src/lib/people/scoring.ts`. It shares the confidence multipliers and the
      cap/breakdown machinery but has its own rules, because a person's score
      measures influence and reachability while a clinic's measures opportunity,
      and the two must never be summed. Recorded in
      [drafts-only-and-person-scoring.md](../decisions/drafts-only-and-person-scoring.md).

- [~] **P5.2 — Person rules built; the Settings UI is not.**
      Seven named rules across Authority (cap 50), Reach (30) and
      Contactability (20); caps sum to 100 so the overall is a real percentage.
      Ownership and directorship require VERIFIED evidence, so an inferred role
      earns nothing and appears in the rejected list. Every point traces to a
      rule, and the lead-detail card opens onto the breakdown.
      **Remaining:** per-org overrides are supported by the config shape and
      covered by a test, but there is no Settings UI for person weights the way
      there is for clinic scoring. Weights can only be changed in code today.

- [x] **P5.3 — Rank people within and across clinics.**
      **`rankPeople` in `src/lib/people/scoring.ts`**, applied on the lead
      detail page. Orders by score, then by verified confidence, then by name so
      the order is stable. A stated owner with reach and a published address
      scores 93; a listed associate scores 4.

## Phase 6 — Personalized generation

Do not start before P3.2. Without person evidence the guard blocks these
drafts, which will read as the feature being broken.

- [ ] **P6.1 — Person-aware draft planning.**
      Extend `planDraft` so citable evidence includes person findings, and so a
      person with no citable evidence degrades to the existing clinic-level
      draft rather than failing.
      *Files:* `src/lib/ai/draft.ts`, `src/lib/ai/strategy.ts`.
      *Done when:* three paths are tested: rich person evidence, thin person
      evidence (falls back), and no person at all (behaves exactly as today).

- [ ] **P6.2 — Prompt and tool-schema changes.**
      The forced `compose_outreach_email` tool already requires a
      claim-to-evidence mapping. Person claims must map the same way.
      *Files:* `src/lib/ai/prompts.ts`.
      *Done when:* a claim about a person with no finding behind it is blocked,
      with a test proving it.

- [ ] **P6.3 — Re-examine the `patient_referral` guardrails.**
      Writing to a named physician makes the PHI scan more important, not less,
      and "never imply an existing clinical or referral relationship" is easier
      to breach when the email names someone.
      *Done when:* reviewed, with any new guardrail added as a restriction.

## Phase 7 — Review and approval

- [ ] **P7.1 — Show the person in the review surface.**
      Who they are, their role and its confidence, their affiliations, the
      email and where it came from, and the draft.
      *Done when:* an approver can see every input to the decision without
      leaving the screen.

- [ ] **P7.2 — Approval covers the recipient, not only the text.**
      Today approval approves a draft. Here it also approves *who it goes to*,
      which is the riskier half.
      *Done when:* the approved recipient and the evidence for that address are
      recorded in the audit log, like any other approval.

## Phase 8 — Testing and rollout

- [ ] **P8.1 — Each component tested independently**, per
      [../testing.md](../testing.md). Blocked paths tested as carefully as
      happy paths.
- [ ] **P8.2 — End-to-end through `verify:db`** against a real database.
- [ ] **P8.3 — One controlled live run** on a small campaign, reviewing every
      draft before approval.
- [ ] **P8.4 — Measure what we can honestly measure.** The app has no reply
      detection or open tracking and is not getting any (see
      [roadmap.md](roadmap.md)), so "response rates and conversion
      performance" from proposal Phase 8 can only come from the manually-set
      pipeline stages. Either accept that, or treat reply detection as its own
      project with its own decisions.

---

## Sequencing summary

```
D1–D4  ──►  P1  ──►  P2  ──►  P3  ──►  P6  ──►  P7  ──►  P8
                      │        │
                      └──► P4 ─┴──►  P5
```

`P4` (contact discovery) and `P5` (scoring) can run alongside `P3`. `P6` needs
both `P3.2` (person evidence exists) and `P4` (an address to send to). Nothing
starts before the decisions.

## Open risks

- **Identity resolution is the technical risk.** Everything downstream inherits
  a wrong merge, and a wrong merge means emailing someone about a clinic they
  have no connection to.
- **Scope creep toward a contact-data product.** Steps 3 and 4 are, in effect,
  building a small physician graph. That is a larger undertaking than the
  proposal's framing suggests, and it is where the cost will land.
- **Deliverability gets harder, not easier.** Mail to a named individual at a
  practice domain is filtered more aggressively than mail to a published
  general inbox. Worth knowing before concluding the feature failed.
- ~~**The product currently never sends.**~~ **RESOLVED 2026-11-04: drafts
  only, permanently.** Proposal Step 7 said "send emails"; that word would have
  reversed the loudest invariant in the system, and it was declined. Approval
  continues to create a Gmail draft and the operator presses send in Gmail. See
  [drafts-only-and-person-scoring.md](../decisions/drafts-only-and-person-scoring.md).
  This also bounds D3: CASL obligations fall on the sender, who is the operator
  in their own mail client, so what the product owes is compliant draft
  *content*, not a sending mechanism.
