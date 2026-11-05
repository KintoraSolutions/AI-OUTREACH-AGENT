# Decision: data sources and personal data for physician-level outreach

Date: 2026-11-04
Status: **Accepted.** Covers D1 and D2 of
[physician-outreach.md](../planning/physician-outreach.md). D3 (CASL) and D4
(address guessing) remain open.

Decision records are not edited after the fact. If one of these is reversed,
add a new record rather than changing this one.

---

## Context

The product today emails clinic general inboxes. The
[physician-outreach proposal](../planning/physician-outreach-proposal.md) moves
to contacting named decision-makers directly. That requires collecting
information about identifiable people, which the system has never done, and
reading sources it has never read.

Two questions had to be settled before the Phase 2 schema, because the schema
encodes both answers.

---

## D1 — Permitted sources

**Decision: the clinic's own website, plus the CPSO public register for
per-physician verification only.**

### What each source is for

| Source | Used for | Not used for |
|---|---|---|
| Clinic's own website | Names, stated roles, work email where the clinic publishes one, team and ownership structure | — |
| CPSO public register | Confirming a named person is a licensed physician; specialty; Ontario hospital affiliations; registration status | Email addresses. Bulk extraction. Building a list. |

Reading the clinic website is not a new capability: `src/lib/research/extract.ts`
already fetches and parses it, robots-respecting, through
`src/lib/research/robots.ts` and `url-guard.ts`. The physician work is an
extension of that crawl, not a second one.

CPSO is a **verification** source, queried per candidate physician we have
already found by name, never enumerated.

### Why CPSO cannot be the contact source

The register does not publish email addresses. Its own page on what is public
lists name, languages, business contact information, specialty, Ontario
hospital privileges, registration status and discipline history, and states
that it does **not** include "the personal email address or birthdate".

So the authoritative source answers *who someone is*, and cannot answer *how to
reach them*. That asymmetry shapes Phase 4: the only realistic source of a
physician's work email under this decision is the clinic publishing it.

### Constraints adopted

1. **Per-record lookup only.** No enumeration, no bulk extraction, no building
   a register mirror. We query for a physician we already identified by name.
2. **Rate-limited and identified**, consistent with the existing per-domain
   crawl pacing.
3. **Provenance required.** Every field stores the URL it came from and when.
4. **Re-check before relying on it.** Registration status changes; a stored
   status is a snapshot, not a fact.

CPSO's contact page states it "will not consider all data requests, depending
on their nature, such as requests for commercial purposes." That concerns their
formal data-sharing process, which we are not using — but it is a clear signal
about the College's posture toward commercial use of physician data, and it is
why this decision restricts us to verification of records we already hold
rather than any form of list-building. CPSO's website terms of use say nothing
about automated access or scraping, and no `robots.txt` was retrievable on
`cpso.on.ca`, `doctors.cpso.on.ca` or `register.cpso.on.ca`. Absence of a
prohibition is not permission; restraint is the posture.

### Rejected

- **LinkedIn.** Its terms prohibit scraping. Contractual risk on top of the
  privacy question, for data we can mostly get elsewhere.
- **Paid contact-data vendors.** The 2009 OPC finding places a due-diligence
  burden on the purchasing organization: information from reputable sources,
  written agreements, warranties. That is a vendor and compliance relationship,
  not a feature. Revisit only if clinic-site coverage proves too thin.
- **Clinic websites alone.** Rejected because affiliation mapping (proposal
  Step 3) would then only connect physicians across clinics we happened to
  crawl, which is the weakest possible version of the highest-value feature.

---

## D2 — What we store about named individuals

**Decision: business contact information *and* a richer professional profile
(bio, publications, stated professional interests), stored separately, with
the enrichment tier severable.**

### The legal shape this has to respect

PIPEDA s.2(1) defines *business contact information* as information used to
communicate with an individual in relation to their employment, business or
profession, "such as the individual's name, position name or title, work
address, work telephone number, work fax number or **work electronic
address**". s.4.01 then excludes Part 1 of the Act entirely for business
contact information collected, used or disclosed **"solely for the purpose of
communicating or facilitating communication with the individual in relation to
their employment, business or profession."**

Two things follow, and they pull in opposite directions:

- A physician's **work email is explicitly inside** the definition. That is
  more favourable than it first appears.
- The exclusion turns on **"solely"**, and whether unsolicited commercial
  outreach is a communication "in relation to their profession" is **not
  settled** by any source consulted. The OPC's posture in adjacent cases is
  unfriendly to the permissive reading: in 2005 it found that collecting
  employees' published contact information to market to them "was not related
  to the purpose for which the employer made [it] publicly available", and in
  2009 that putting an address on a website "does not make it 'publicly
  available' as defined in the Regulations, nor does it follow that the
  individual has given… implied consent to receiving marketing messages."

The alternative basis, the "publicly available information" regulation, is
weak here: its professional-directory category covers *name, title, address and
telephone number* and **does not list email**.

### The decision, and the risk accepted

The richer professional profile was chosen over the minimal option. Bio,
publications and stated interests are **not** in the s.2(1) list, so the s.4.01
exclusion very likely does not cover them even though it may cover the contact
fields beside them. **That risk is accepted deliberately**, on the basis that
recipient-specific research is the point of the proposal and a purely
contact-level record would not support proposal Step 6.

### Mitigation: two tiers, split by legal basis

The schema separates the two rather than mixing them in one record, so the
weaker-footing data is severable:

| Tier | Fields | Basis | If challenged |
|---|---|---|---|
| **Contact** | name, title/role, work email, work phone, affiliations | Intended to sit inside s.4.01 | Core outreach continues |
| **Enrichment** | bio, publications, stated professional interests | Outside s.4.01; ordinary consent rules | **Drop the table; the product still works** |

This is the whole point of the split: if counsel restricts the enrichment tier,
the change is deleting one table and the personalization degrades to
contact-level. Nothing else breaks.

### Obligations adopted regardless of tier

1. **Single declared purpose**, recorded in the schema and in the privacy
   policy: communicating with the individual about their profession. Not resold,
   not repurposed, not used to build a product for anyone else.
2. **Provenance on every field** — source URL and timestamp. This is what makes
   the "solely" claim arguable at all, and what makes an access request
   answerable.
3. **Deletion on request for a single person**, including their enrichment
   record and affiliations.
4. **Retention covers people.** The existing `retentionDays` purge is
   clinic-shaped and must be extended, or person records outlive the leads
   they were collected for.
5. **No clinical data, ever.** No patient information, no PHI, no birthdate,
   nothing about the physician's own health. The existing PHI guard
   (`src/lib/ai/draft-guard.ts`) stays and becomes more important, not less.
6. **Enrichment is evidence, not colour.** Anything used to personalize a draft
   must be stored as a finding with a source, or `validateDraft` will block the
   claim — correctly. See
   [architecture.md § Invariants](../architecture.md#invariants-do-not-break-these).

### Distinction worth preserving

The OPC's interpretation bulletin says consent is not required for a business
email "published on a website **by the individual to whom it relates**". An
address a *clinic* publishes about an employee is not plainly the same thing.
The schema therefore records **who published the address** where we can tell,
so that distinction is available later rather than lost at collection time.

---

## Consequences for the plan

- `P1.1` — a `Person` model plus affiliations, with enrichment in its **own
  table**, not columns on the person. Severability is a schema requirement now.
- `P2.2` — clinic-site team extraction stays the primary discovery path.
- `P2.5` (new) — CPSO verification step: licence, specialty, hospital
  affiliations, per-physician, rate-limited.
- `P3.1` — identity resolution gains a strong corroborating signal: a CPSO
  record. This materially reduces the risk of a wrong merge.
- `P4.1` — narrows considerably. Clinic-published addresses are effectively the
  only source. Expect coverage gaps, and expect the clinic inbox to remain the
  fallback for many leads.
- `P4.4` — retention and deletion must cover both tiers.
- Privacy policy (already a launch blocker in
  [roadmap.md](../planning/roadmap.md)) must now describe personal data
  collection about physicians, both tiers, the purpose, and the deletion route.

## What would reverse these

- **D1:** CPSO publishing a machine-readable interface with terms that permit
  this use; or clinic-site coverage proving too thin to be viable, which would
  reopen the vendor question.
- **D2:** counsel concluding the enrichment tier cannot be justified, in which
  case the tier is dropped and personalization degrades to contact-level; or
  concluding that cold commercial outreach falls outside the s.4.01 "solely"
  purpose, which would be a larger reconsideration affecting the whole product.

## Sources

- [PIPEDA, S.C. 2000, c. 5 (ss. 2(1), 4.01, 5(3), 7)](https://laws-lois.justice.gc.ca/eng/acts/P-8.6/page-1.html)
- [OPC Interpretation Bulletin: Publicly Available Information](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda-compliance-help/pipeda-interpretation-bulletins/interpretations_06_pai/)
- [PIPEDA Case Summary #2009-013](https://www.priv.gc.ca/en/opc-actions-and-decisions/investigations/investigations-into-businesses/2009/pipeda-2009-013)
- [CPSO — What's public on the registers](https://www.cpso.on.ca/physician-register/what-s-public--and-what-s-not--on-the-registers)
- [CPSO — Contact us, physician data requests](https://www.cpso.on.ca/contact-us)
- [CPSO — Privacy policy](https://www.cpso.on.ca/privacy-policy)
- [CPSO — Website terms of use](https://www.cpso.on.ca/terms-of-use)

**This is a record of an engineering decision, not legal advice.** The
unsettled question is whether cold commercial outreach meets the s.4.01
"solely" purpose. That is the one to put to counsel, and the two-tier split
exists so that a restrictive answer costs one table rather than the project.
