import type { ChecklistState } from "@/lib/onboarding/checklist";

/**
 * Tutorial content model.
 *
 * Pure data: no React, no DB, no server imports, so the whole walkthrough is
 * unit-testable and the page stays a thin renderer. The `ChecklistState` import
 * is type-only (erased at compile time), which keeps this module free of the
 * Prisma client that `checklist.ts` pulls in at runtime.
 *
 * Every factual statement below was verified against the code it describes:
 * the caps and multipliers come from `src/lib/scoring/rules.ts`, the block and
 * warning reasons from `src/lib/ai/draft-guard.ts`, the seven Gmail guards from
 * `src/lib/integrations/gmail-guard.ts`, and the two-stage pipeline from
 * `src/lib/ai/draft.ts`. If one of those files changes, this one is stale.
 */

/** A small presentational block union. The renderer maps each kind to markup. */
export type Block =
  | { kind: "p"; text: string }
  /** An ordered procedure. Rendered as <ol>. */
  | { kind: "steps"; items: string[] }
  /** An unordered set of points. Rendered as <ul>. */
  | { kind: "list"; items: string[] }
  /** A term/definition set. Rendered as <dl>. */
  | { kind: "definitions"; items: { term: string; text: string }[] }
  /** A callout. `tone` maps onto the Alert variants. */
  | { kind: "note"; tone: "info" | "warning" | "success"; title: string; text: string }
  /** A compact reference table. `head.length` must equal each row's length. */
  | { kind: "table"; caption: string; head: string[]; rows: string[][] };

export type FigureKey =
  | "pipeline"
  | "ai-profile"
  | "lead-sources"
  | "campaign-run"
  | "score-breakdown"
  | "two-stage-draft"
  | "draft-panel"
  | "approval-flow"
  | "follow-ups"
  | "safety-layers";

export interface Chapter {
  id: string;
  title: string;
  /** One line: what you will be able to do after this chapter. */
  goal: string;
  body: Block[];
  /** Exact labels the user should be able to find on screen. */
  lookFor?: string[];
  cta?: { label: string; href: string };
  /** Deep link into the help centre. */
  helpSlug?: string;
  /** Which live checklist key marks this chapter as already done. */
  requires?: keyof ChecklistState;
  figure?: FigureKey;
}

export const CHAPTERS: Chapter[] = [
  // -------------------------------------------------------------------------
  {
    id: "welcome",
    title: "Welcome",
    goal: "Understand what this app does, and the one rule that shapes every screen in it.",
    figure: "pipeline",
    helpSlug: "getting-started",
    body: [
      {
        kind: "p",
        text: "This app researches healthcare clinics, scores them against your own opportunity model, and writes outreach emails grounded in what the research actually found.",
      },
      {
        kind: "note",
        tone: "info",
        title: "It only ever writes drafts",
        text: "Nothing in this application sends an email. Approving a draft creates a draft in your Gmail account. You open Gmail, read it, and press Send yourself. There is no schedule, no queue, and no automatic send anywhere in the product.",
      },
      {
        kind: "p",
        text: "That constraint is why the rest of the app looks the way it does. Every claim an email makes has to point at a stored piece of evidence, every score shows the findings that produced it, and a draft that cannot be supported is blocked rather than invented.",
      },
      {
        kind: "p",
        text: "The work moves through seven stages. Research gathers findings, scoring turns those findings into points, drafting picks an angle and writes the email, a human reviews it, an admin approves it, a Gmail draft appears, and you send it.",
      },
      {
        kind: "definitions",
        items: [
          {
            term: "Your role",
            text: "Viewer, Member, Admin, or Owner, in that order. Each level includes everything below it. Your current role is shown in the top right of every page, next to your name.",
          },
          {
            term: "What roles change",
            text: "Viewers read. Members add leads, generate drafts, edit them, and reject them. Admins additionally run research, approve drafts, and change settings. Owners are admins with full control of the organization.",
          },
        ],
      },
      {
        kind: "p",
        text: "This tutorial has ten chapters and follows the real order of work. It reads your organization's actual data as you go, so a chapter you have already completed says so rather than pretending you have not started.",
      },
    ],
    lookFor: ["Katalyst", "Dashboard", "Leads", "Campaigns", "Research jobs", "Settings"],
  },

  // -------------------------------------------------------------------------
  {
    id: "your-ai",
    title: "Your AI",
    goal: "Tell the app who you are and what you sell, so every draft argues from your offer instead of a generic one.",
    figure: "ai-profile",
    helpSlug: "your-ai",
    requires: "aiConfirmed",
    cta: { label: "Open Settings", href: "/settings" },
    body: [
      {
        kind: "p",
        text: "Your AI profile is the single place the drafting engine learns what your organization actually offers. It is worth getting right before anything else, because every email the app writes is built from it.",
      },
      {
        kind: "definitions",
        items: [
          {
            term: "Offerings",
            text: "What you sell, one entry per opportunity area, each with its own name and an optional proof link. Those names then replace the built-in category names everywhere, including in the wording of a score explanation.",
          },
          {
            term: "Use case",
            text: "Who you are writing to. Service pitch means you are offering a product or service to a business, and a draft requires evidence of an opportunity in the area you are pitching or it is blocked. Patient referrals means you are writing provider to provider, where an introduction that makes no claims about the recipient is a legitimate email, and any mention of an identifiable patient is blocked outright.",
          },
          {
            term: "Preferred and avoided wording",
            text: "Terminology you want used and terminology you never want to see. Avoided wording is enforced when the draft is written, not corrected afterwards.",
          },
          {
            term: "Your custom rules",
            text: "Extra restrictions in your own words, applied on top of everything else.",
          },
        ],
      },
      {
        kind: "note",
        tone: "warning",
        title: "Custom rules can only add restrictions",
        text: "Your rules are appended to the preset's safety rules, never merged over them. You can forbid something the preset allows. You cannot permit something the preset forbids, and no wording in the custom rules box will unlock a blocked claim.",
      },
      {
        kind: "p",
        text: "The app can infer a first draft of this profile from your website, but it is stored only once you review and confirm it. Until you do, this chapter stays unfinished and the dashboard keeps prompting you.",
      },
    ],
    lookFor: ["Your AI", "Company profile", "Email voice"],
  },

  // -------------------------------------------------------------------------
  {
    id: "adding-leads",
    title: "Adding leads",
    goal: "Get clinics into the app, and know what each route does and does not give you.",
    figure: "lead-sources",
    helpSlug: "adding-leads",
    requires: "hasLeads",
    cta: { label: "Add a lead", href: "/leads/new" },
    body: [
      { kind: "p", text: "There are exactly three ways a clinic becomes a lead." },
      {
        kind: "steps",
        items: [
          "New lead. One clinic at a time, typed in by hand. Use it when you already know who you want to reach.",
          "Import CSV. A spreadsheet of clinics in one pass. Recognized headers include name, category, website, phone, email, address, contact name, contact title, contact email, booking method, and contact page.",
          "A research campaign. The app finds clinics matching your criteria and researches each one. This is the subject of the next chapter.",
        ],
      },
      {
        kind: "note",
        tone: "warning",
        title: "This is the thing that surprises everyone",
        text: "A lead added by hand or imported from CSV has no findings and no score. Nothing is researched at the moment you create it. It has a name and contact details and nothing else, so it cannot be drafted for yet. A lead only gets findings and a score when a campaign researches it or when someone records a manual finding on it.",
      },
      {
        kind: "p",
        text: "That is deliberate rather than a gap. A score in this app means research was performed and evidence was stored, so the app will not put a number next to a clinic it has never looked at.",
      },
      {
        kind: "definitions",
        items: [
          {
            term: "Duplicate prevention",
            text: "Each clinic gets a dedupe key built from its website domain, its normalized name, and its address. Common words such as clinic, centre, medical, and health are stripped before matching, so Smith Family Medical Clinic and Smith Family Clinic collapse to the same key.",
          },
          {
            term: "What happens on a collision",
            text: "The key is unique per organization and enforced by the database. During a CSV import, a row matching an existing lead is skipped rather than merged or duplicated, and the import summary tells you how many were skipped.",
          },
        ],
      },
    ],
    lookFor: ["New lead", "Import CSV", "Do not contact"],
  },

  // -------------------------------------------------------------------------
  {
    id: "campaigns",
    title: "Campaigns and research",
    goal: "Run the research that turns a list of clinics into evidence you can write from.",
    figure: "campaign-run",
    helpSlug: "campaigns-and-research",
    requires: "hasCampaign",
    cta: { label: "Create a campaign", href: "/campaigns/new" },
    body: [
      {
        kind: "p",
        text: "A campaign is a set of criteria plus the research run that acts on them. It is the only thing in the app that produces findings automatically.",
      },
      {
        kind: "p",
        text: "Creating one asks for a campaign name and at least one clinic category, then the search area and the limits that keep a run bounded.",
      },
      {
        kind: "table",
        caption: "Campaign criteria",
        head: ["Field", "What it does"],
        rows: [
          ["Clinic categories", "Which kinds of clinic to look for. At least one is required."],
          ["City, Province / state, Country", "Where to search."],
          ["Search radius (km)", "How far from that location to look."],
          ["Maximum leads", "A hard ceiling on how many clinics the run may add. Required."],
          ["Minimum locations", "Skip clinics smaller than this, when location count is known."],
          ["Required keywords", "A clinic must match these to be kept."],
          ["Excluded keywords", "A clinic matching any of these is discarded."],
        ],
      },
      {
        kind: "p",
        text: "With the criteria saved, Run research starts the job. While it is running you can Pause it, Resume it afterwards, or Cancel it outright. A finished campaign offers Run again, which re-runs the same criteria.",
      },
      {
        kind: "p",
        text: "Research jobs shows every run: its status, how far through it is, how many entries it processed, and any errors it hit. A run that fails on one clinic keeps going, and the failure is recorded against that clinic rather than killing the job.",
      },
      {
        kind: "note",
        tone: "info",
        title: "Two things gate automated discovery",
        text: "Discovery needs a GOOGLE_PLACES_API_KEY configured on the server. Without it the campaign controls say so, and you can still add leads by hand or by CSV. Separately, running, pausing, resuming, and cancelling research are Admin actions, so a Member can create a campaign but cannot start it.",
      },
    ],
    lookFor: ["Run research", "Pause", "Resume", "Cancel", "Research jobs"],
  },

  // -------------------------------------------------------------------------
  {
    id: "understanding-scores",
    title: "Understanding scores",
    goal: "Read a score as an argument you can check, not as a verdict you have to trust.",
    figure: "score-breakdown",
    helpSlug: "how-scoring-works",
    requires: "hasScoredLead",
    body: [
      {
        kind: "p",
        text: "Scoring is deterministic. The same findings and the same configuration always produce the same number, and every point traces back to one rule and the finding that fired it.",
      },
      {
        kind: "p",
        text: "Points are collected in five categories, each capped. The caps add up to 100, which is why the overall score is out of 100.",
      },
      {
        kind: "table",
        caption: "Categories and their default caps",
        head: ["Category", "Cap", "What it measures"],
        rows: [
          ["Website", "30", "Booking, mobile readiness, performance, metadata, contact information."],
          ["Software", "25", "Manual intake, downloadable forms, referral workflows, disconnected systems."],
          ["Phone operations", "25", "Call-first booking, multiple numbers, routing complexity."],
          ["Contactability", "10", "Whether a usable public email, form, or phone number exists."],
          ["Business fit", "10", "Whether the clinic is the kind of organization you target."],
        ],
      },
      {
        kind: "p",
        text: "A finding becomes points in two steps, and evidence quality is checked at both of them.",
      },
      {
        kind: "steps",
        items: [
          "The first gate is the rule's minimum confidence. Each rule states the weakest evidence it will accept. A finding below that bar contributes zero and is listed separately as rejected, with the reason. An inference can never fire a rule that requires a verified fact.",
          "The second gate is the confidence multiplier. A finding that clears the bar has its points scaled by how good the evidence is: verified counts in full, a strong inference at three quarters, a weak inference at half, and unknown at zero.",
        ],
      },
      {
        kind: "p",
        text: "Category subtotals are then clamped to their caps and added together. Because of the caps, ten small website problems cannot outweigh a genuine opportunity elsewhere.",
      },
      {
        kind: "definitions",
        items: [
          {
            term: "Recommended service",
            text: "The strongest opportunity area, as long as it clears the 8-point floor. If the second area also clears the floor and is within 4 points of the first, the recommendation becomes Combined and the draft pitches both.",
          },
          {
            term: "NONE",
            text: "Not an error and not a low score. It means the strongest area did not reach the floor, so the app is declining to recommend anything. The stored reason names the area and its exact subtotal, so you can see how far short it fell.",
          },
          {
            term: "Overall confidence",
            text: "How much of the score came from verified facts rather than inference. At or above 60 percent of the points it is High, at or above 30 percent Medium, otherwise Low. A lead with no points at all is Low.",
          },
        ],
      },
      {
        kind: "p",
        text: "On a lead, Recalculate re-runs the engine against the current findings and the current configuration, which is what you want after editing or dismissing a finding. Override replaces the number and the recommended service with your own judgement and records who did it and why. Clearing the override returns the lead to the computed value. Both are Admin actions.",
      },
      {
        kind: "note",
        tone: "info",
        title: "The rules are yours to tune",
        text: "Settings, Lead scoring lets an admin change individual rule weights, the category caps, the confidence multipliers, and the recommendation thresholds. Stored scores keep the ruleset version that produced them, so an old score is never silently reinterpreted under new rules.",
      },
    ],
    lookFor: ["Recalculate", "Override", "Recommended service", "Lead scoring"],
  },

  // -------------------------------------------------------------------------
  {
    id: "generating-a-draft",
    title: "Generating a draft",
    goal: "Produce an email whose every sentence is traceable to something the research actually found.",
    figure: "two-stage-draft",
    helpSlug: "generating-drafts",
    requires: "hasDraft",
    cta: { label: "Go to Leads", href: "/leads" },
    body: [
      {
        kind: "p",
        text: "Generating a draft runs two stages. Knowing which is which explains almost every result you will see.",
      },
      {
        kind: "definitions",
        items: [
          {
            term: "Stage A, the angle",
            text: "Ordinary code, no model involved. It reads the stored score, findings, and any override, and decides which opportunity to pitch and which observations may be cited. Because it is deterministic, the same lead always produces the same angle.",
          },
          {
            term: "Stage B, the writing",
            text: "The language model, called with only the observations Stage A selected. It cannot see your database, it cannot browse, and it is not given findings that were dismissed or that are too weak to cite.",
          },
        ],
      },
      {
        kind: "note",
        tone: "warning",
        title: "Not enough evidence means the model is never called",
        text: "If Stage A cannot find a defensible angle, the draft is blocked right there and no request is ever sent to the model. This is the whole design: with nothing true to say, the app stops instead of writing something plausible. The blocked draft records the reason, which usually names the area and how far short it fell.",
      },
      {
        kind: "p",
        text: "Only findings that are verified or strong inferences can be cited at all. Weak inferences and unknowns still count towards the score, but the drafting engine is never shown them, so it cannot state a guess as though it were established.",
      },
      {
        kind: "p",
        text: "After Stage B returns, a deterministic guard re-checks the result before anything is saved. That check is the subject of the next chapter.",
      },
      {
        kind: "p",
        text: "Drafts can be generated one lead at a time from the lead page, or in bulk from the leads list when you want to work through a scored segment.",
      },
    ],
    lookFor: ["Generate draft", "Draft ready", "Needs review"],
  },

  // -------------------------------------------------------------------------
  {
    id: "reading-the-draft",
    title: "Reading the draft",
    goal: "Review a draft the way it is meant to be reviewed: by checking its evidence, not just its tone.",
    figure: "draft-panel",
    helpSlug: "evidence-and-claims",
    body: [
      {
        kind: "p",
        text: "The draft panel shows the email next to the reasons it says what it says. The email itself is the least interesting part of that panel.",
      },
      {
        kind: "definitions",
        items: [
          {
            term: "The evidence list",
            text: "Every observation the draft was allowed to use, each with its source link. Open the link and confirm the observation is still true. This is the review.",
          },
          {
            term: "Fact or inference",
            text: "A fact was directly confirmed, such as a page served without HTTPS. An inference was reasoned from what was visible, such as intake appearing to be call-first. Inferences are legitimate to write from, but they are the sentences to read twice.",
          },
          {
            term: "The claim map",
            text: "Each sentence the model asserted, paired with the evidence code backing it. A claim with no code is a generic statement about you rather than about the clinic, which is allowed. A claim pointing at evidence that does not exist is what gets a draft blocked.",
          },
        ],
      },
      {
        kind: "note",
        tone: "info",
        title: "What the confidence number is",
        text: "It starts from the share of supporting evidence that is verified fact rather than inference, which puts it between 35 for all inference and 90 for all facts, then drops 3 points for each review warning. It is a measure of how well evidenced the email is. It is not a prediction that anyone will reply, and it is not a quality rating of the writing.",
      },
      {
        kind: "p",
        text: "Review warnings are things a human should weigh, not walls. You can approve a draft that carries them.",
      },
      {
        kind: "list",
        items: [
          "The wording rests on inference-level evidence rather than verified fact.",
          "The body contains an em dash, which should be removed before sending.",
          "The body uses urgency wording such as act now or limited time.",
          "The body is outside the target word range for your configured voice.",
          "A proof link your offering specifies is missing from the body.",
          "The lead has no verified recipient email, so there is nobody to send to yet.",
        ],
      },
      {
        kind: "p",
        text: "A block is different. A blocked draft cannot be approved at all until it is edited or regenerated.",
      },
      {
        kind: "list",
        items: [
          "A claim cites evidence that does not exist or is not sufficiently supported.",
          "A claim relies on a finding somebody dismissed.",
          "The draft asserts lost calls, lost revenue, or operational failure without verified evidence behind it.",
          "The draft refers to how the clinic's information was gathered.",
          "The draft pretends to be a patient or fakes prior familiarity.",
          "The draft contains an unfilled template placeholder.",
          "The draft does not use the clinic's exact name.",
          "On patient referral outreach only, the draft appears to reference protected health information.",
        ],
      },
      {
        kind: "p",
        text: "You can edit a draft by hand. Your edit is re-checked with the same text rules, so a manual change cannot smuggle past the guard, and an edit that trips a block is saved but marked blocked.",
      },
    ],
    lookFor: ["Evidence", "Claim map", "Confidence", "Review warnings", "Blocked"],
  },

  // -------------------------------------------------------------------------
  {
    id: "approving",
    title: "Approving and Gmail",
    goal: "Turn a reviewed draft into a Gmail draft, and know exactly where the app stops.",
    figure: "approval-flow",
    helpSlug: "approving-and-gmail",
    requires: "hasApprovedDraft",
    body: [
      {
        kind: "p",
        text: "Approval is an Admin action. A Member can generate, edit, and reject a draft, but cannot approve one. A draft that is blocked cannot be approved by anyone, and only a draft currently in review is eligible.",
      },
      {
        kind: "p",
        text: "Approving does two things at once. It records the approval against your name, and it creates a draft in the connected Gmail account.",
      },
      {
        kind: "note",
        tone: "success",
        title: "The connection can only compose",
        text: "The app requests Gmail's compose scope, which creates drafts. It does not request send or modify. Even if something went badly wrong, the access it holds cannot send mail on your behalf.",
      },
      {
        kind: "p",
        text: "Seven checks run before a Gmail draft is created, and the first one that fails is the one reported.",
      },
      {
        kind: "steps",
        items: [
          "The draft is approved and unchanged since approval.",
          "The lead has a recipient email address.",
          "That address is actually a valid address.",
          "The lead is not marked do not contact.",
          "The recipient is not on the suppression list.",
          "The recipient has no unsubscribe record.",
          "An authorized Google account is connected.",
        ],
      },
      {
        kind: "p",
        text: "If a check fails, the approval still stands and the app tells you why no Gmail draft appeared. Connect Google or fix the recipient and you can create it afterwards without re-approving.",
      },
      {
        kind: "definitions",
        items: [
          {
            term: "One Gmail draft per version",
            text: "Creation is idempotent against the approved version. Running it twice will not produce two drafts in your mailbox; the second attempt reports that one already exists.",
          },
          {
            term: "Editing after approval",
            text: "Editing an approved draft returns it to review and it has to be approved again. That is intentional, because the Gmail draft was created from the version that was approved, not from whatever it says now.",
          },
        ],
      },
      {
        kind: "note",
        tone: "warning",
        title: "You still press Send",
        text: "At this point the work is finished inside this app. The email is sitting in your Gmail drafts folder. Open it, read it one last time, and send it yourself. The app will never do that step for you.",
      },
    ],
    lookFor: ["Approve", "Reject", "Gmail draft created", "Connect Google"],
  },

  // -------------------------------------------------------------------------
  {
    id: "follow-ups",
    title: "Follow-ups",
    goal: "Keep track of who needs another touch and when, without leaving the lead.",
    figure: "follow-ups",
    helpSlug: "follow-ups",
    body: [
      {
        kind: "p",
        text: "A follow-up is a dated reminder attached to a lead. You schedule it from the lead page, with a date, a note, a priority, and an owner.",
      },
      {
        kind: "definitions",
        items: [
          {
            term: "Priority",
            text: "Low, Medium, or High. It sets how the follow-up is ordered and badged so the urgent ones surface first.",
          },
          {
            term: "Assignee",
            text: "Any member of your organization, defaulting to you. A follow-up can also be left unassigned.",
          },
          {
            term: "Calendar sync",
            text: "Optional. With a Google account connected you can tick Add to calendar and the follow-up becomes a calendar event, which can be updated later or cancelled. Without a connection the option is disabled and the follow-up still works inside the app.",
          },
        ],
      },
      {
        kind: "p",
        text: "Completing a follow-up records it against the lead's activity timeline alongside the research, scoring, drafting, and approval events, so the lead's history stays in one place.",
      },
      {
        kind: "note",
        tone: "info",
        title: "Outcomes are recorded by you",
        text: "The app has no connection to your inbox for reading mail. It cannot detect a reply, a booked meeting, or a bounce. If a conversation progresses, move the lead's stage yourself so the pipeline reflects reality.",
      },
    ],
    lookFor: ["Schedule follow-up", "Priority", "Assignee", "Add to calendar"],
  },

  // -------------------------------------------------------------------------
  {
    id: "settings-and-safety",
    title: "Settings and safety",
    goal: "Know where every control lives, and which ones protect people rather than tune output.",
    figure: "safety-layers",
    helpSlug: "settings-overview",
    body: [
      {
        kind: "p",
        text: "Settings holds eight cards. The first four shape what the app writes, the rest govern how it behaves.",
      },
      {
        kind: "table",
        caption: "The settings cards",
        head: ["Card", "What it controls"],
        rows: [
          ["Your AI", "Offerings, use case, terminology, and your custom rules."],
          ["Company profile", "Who you are, as described to the model."],
          ["Email voice", "Tone and target length, which sets the word range warnings use."],
          ["Lead scoring", "Rule weights, category caps, confidence multipliers, thresholds."],
          ["Integrations", "The Google connection used for Gmail drafts and calendar events."],
          ["System status", "Which server-side capabilities are configured, and which are not."],
          ["Data retention", "How long research data is kept, plus manual purge."],
          ["Compliance", "The acknowledgement your organization records before outreach."],
        ],
      },
      {
        kind: "p",
        text: "Two separate mechanisms stop the app contacting someone.",
      },
      {
        kind: "definitions",
        items: [
          {
            term: "Do not contact",
            text: "A switch on an individual lead. Turning it on also adds that lead's public email to the suppression list, so the protection survives the lead being re-imported later.",
          },
          {
            term: "The suppression list",
            text: "Organization-wide, and matched by email address or whole domain. A suppressed recipient fails the Gmail guard, so no Gmail draft is created for them even if a draft was approved.",
          },
        ],
      },
      {
        kind: "note",
        tone: "warning",
        title: "Retention purge is manual",
        text: "Set a retention window in days and the settings card shows you what currently falls outside it. Nothing is deleted on a schedule. A purge happens only when someone presses the button and confirms, so there is no background job quietly removing your data.",
      },
      {
        kind: "table",
        caption: "What each role can do",
        head: ["Action", "Viewer", "Member", "Admin", "Owner"],
        rows: [
          ["View leads, scores, and drafts", "Yes", "Yes", "Yes", "Yes"],
          ["Add leads, import CSV, edit leads", "No", "Yes", "Yes", "Yes"],
          ["Generate, edit, and reject drafts", "No", "Yes", "Yes", "Yes"],
          ["Run, pause, and cancel research", "No", "No", "Yes", "Yes"],
          ["Recalculate and override scores", "No", "No", "Yes", "Yes"],
          ["Approve a draft and create the Gmail draft", "No", "No", "Yes", "Yes"],
          ["Change settings and retention", "No", "No", "Yes", "Yes"],
        ],
      },
      {
        kind: "note",
        tone: "info",
        title: "Roles are assigned outside the app",
        text: "There is no screen for inviting a member or changing someone's role. Your own role is shown beside your name in the header.",
      },
    ],
    lookFor: ["Your AI", "Lead scoring", "Integrations", "Data retention", "Compliance"],
  },
];

/** The sign-off rendered after the final chapter. */
export const CLOSING = {
  title: "You are set up",
  text: "You now know the whole path: profile, leads, research, scores, drafts, review, approval, and the send you perform yourself. The help centre goes deeper on any single step, and the dashboard shows what your organization still has outstanding.",
  links: [
    { label: "Browse the help centre", href: "/help" },
    { label: "Go to the dashboard", href: "/dashboard" },
  ],
} as const;

export function chapterById(id: string): Chapter | null {
  return CHAPTERS.find((c) => c.id === id) ?? null;
}
