# Decision: the product stays drafts-only, and people get their own score

Date: 2026-11-04
Status: **Accepted.**

Two decisions taken together while planning Phase 5 of
[physician-outreach.md](../planning/physician-outreach.md).

---

## 1. Katalyst does not send email

Step 7 of the [physician-outreach proposal](../planning/physician-outreach-proposal.md)
says the user should be able to "review leads, approve drafts, **send emails**,
and track outreach history". That one word would have reversed the loudest
invariant in the system.

**Decision: drafts only. The product does not send, and will not.**

Approval continues to create a draft in the operator's own Gmail; the operator
presses send themselves, in Gmail. Nothing changes in the code, which is the
point: this closes a question the proposal had left open, rather than starting
work.

### Why

- Only `gmail.compose` is requested. There is no send endpoint, no SMTP, no
  sequencer anywhere in the codebase, and adding one would mean a new OAuth
  scope and re-consent for every connected account.
- The hallucination guard's value depends on a human reading the draft. A
  blocked draft is currently caught before anything leaves; with direct
  sending, the guard becomes the last line rather than one of two.
- It is the claim the public site makes most prominently, and it is the
  strongest thing the product says about itself.
- Reversing it is a product identity change, not a feature. If it is ever
  revisited, it needs its own record and its own consent flow.

This also bounds the CASL question (D3): obligations for a commercial
electronic message fall on the sender, and the sender is the operator in their
own mail client. What the product owes is drafts that carry what a compliant
message needs, not a sending mechanism.

---

## 2. People are scored by a separate engine

**Decision: a new `scorePerson` in `src/lib/people/scoring.ts`, not a
generalisation of `scoreClinic`.**

### Why

1. **The two scores answer different questions.** A clinic's score measures
   *opportunity* — how much is wrong with their public setup. A person's score
   measures *influence and reachability*. They are not commensurable, and
   sharing an engine invites someone to add them together.
2. **`scoreClinic` is the most load-bearing function in the codebase.** It is
   pure, heavily tested, and executed live by the public marketing page to
   print a worked example, pinned by `sample-lead.test.ts`. Widening it to
   carry a second set of categories and caps is risk for no gain.
3. **`FindingCategory` keys the clinic engine's category maps and caps.**
   Adding a person category to that enum would pull person evidence into
   clinic scoring, which is the bug this avoids by construction.

### What is shared

The machinery that should not be reinvented: the same confidence multipliers
(imported from `@/lib/scoring/rules`), the same rule that points scale with how
well the evidence is supported, the same refusal to let evidence below a rule's
minimum contribute anything, the same per-category caps, and the same stored
breakdown with rejected contributions listed.

### The model

| Area | Cap | Rules |
|---|---|---|
| Authority | 50 | owner 50, medical director 40, practice leadership 28, lead physician 25, listed physician 8 |
| Reach | 30 | affiliated with multiple clinics 30 |
| Contactability | 20 | direct professional address 20 |

Caps sum to 100, so the overall is a real percentage rather than an arbitrary
total. Authority dominates deliberately: reaching a practice manager who can
sign is worth more than reaching three associates who cannot.

Ownership and directorship require `VERIFIED` evidence, so a role we inferred
rather than one the clinic stated earns nothing and is listed as rejected in
the breakdown.

### Consequence

`buildPersonFindings` now emits one code per role tier
(`person_role_owner`, `person_role_medical_director`, and so on) rather than a
single `person_stated_role`. A single code could not express that an owner
outranks an associate, because the engine keys rules by code. A test asserts
every emitted code has a rule and every rule has an emitting code, so the two
files cannot drift apart.

### Not built

Per-org overrides are supported by the config shape (`ruleWeights`,
`categoryCaps`, `confidenceMultipliers`) and covered by a test, but there is
**no Settings UI** for person scoring yet, unlike clinic scoring. Weights can
only be changed in code today.
