# Katalyst documentation

Katalyst is an outbound lead-research and outreach tool for healthcare clinics.
It discovers clinics through the Google Places API, crawls their public
websites to produce evidence findings, scores each one with a deterministic
rule engine, drafts an email in which every factual claim maps to stored
evidence, and — on human approval — creates a **draft in the operator's own
Gmail**. It never sends.

> The repository folder is named `Outreach AI` and the product is named
> **Katalyst**. The app previously called itself "Outreach Agent" in its
> metadata and header; that is unified on Katalyst everywhere.

## Start here

| If you want to | Read |
|---|---|
| Run it locally for the first time | [development.md](development.md) |
| Understand how the pieces fit together | [architecture.md](architecture.md) |
| Know what is safe to change, and what is load-bearing | [architecture.md § Invariants](architecture.md#invariants-do-not-break-these) |
| Write or run tests | [testing.md](testing.md) |
| Put it on the internet | [deployment.md](deployment.md) |
| Change the UI | [design-system.md](design-system.md) |
| Know what is done and what is not | [planning/roadmap.md](planning/roadmap.md) |
| Work on physician-level outreach | [planning/physician-outreach.md](planning/physician-outreach.md) |

## Map of this directory

```
docs/
├── README.md                 you are here
├── architecture.md           modules, data flow, and the invariants
├── development.md            setup, daily commands, conventions, gotchas
├── testing.md                how testing works and what is covered
├── deployment.md             going from localhost to a public URL
├── design-system.md          Fluent tokens, components, and the app shell
├── planning/
│   ├── roadmap.md            current state, open work, deferred work
│   ├── physician-outreach.md       active: decision-maker outreach, step by step
│   ├── physician-outreach-proposal.md   its source proposal, verbatim
│   ├── build-plan.md         the original phased build plan (long, canonical)
│   └── product-brief.md      the original product specification
└── decisions/
    ├── marketing-site-redesign.md   why the public site looks the way it does
    ├── physician-outreach-data.md   permitted sources and personal-data posture
    └── drafts-only-and-person-scoring.md   why it never sends, and why people
                                            have their own scoring engine
```

## Document types

- **Reference** (`architecture.md`, `design-system.md`) describes how the
  system is, and should be updated in the same change that makes it untrue.
- **Guide** (`development.md`, `testing.md`, `deployment.md`) tells a person
  how to do something. Written for someone who has not seen the repo before.
- **Planning** (`planning/`) is intent. `build-plan.md` is historical and
  deliberately not rewritten as the code evolves; `roadmap.md` is the living
  one.
- **Decisions** (`decisions/`) record why something was done a particular way,
  including the options rejected. They are not updated after the fact. If a
  decision is reversed, add a new document rather than editing the old one.

Code comments reference the build plan by section, for example
`docs/planning/build-plan.md Section 5`. Those references are load-bearing for
understanding *why* a module exists, so keep the section numbering stable.
