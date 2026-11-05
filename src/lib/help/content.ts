/**
 * The Help Centre's content, as a typed module rather than as JSX.
 *
 * Keeping articles as data (not markup) is what makes them searchable
 * (`searchArticles` reads every block's text), linkable (`HelpTip` resolves a
 * slug to a summary), and testable (`content.test.ts` asserts that every
 * required slug exists and every cross-reference resolves) without rendering
 * React or touching the database.
 *
 * ACCURACY CONTRACT
 * Everything written here was verified against the code that implements it:
 *   scoring          src/lib/scoring/rules.ts, engine.ts
 *   drafting         src/lib/ai/strategy.ts, draft.ts, draft-guard.ts, evidence.ts
 *   AI profile       src/lib/ai/org-ai-profile.ts, use-cases.ts, presets/
 *   Gmail            src/lib/integrations/scopes.ts, gmail.ts, gmail-guard.ts
 *   permissions      src/lib/auth/roles.ts + the requireRole() calls in actions
 *   duplicates       src/lib/leads/dedupe.ts
 * Button and field names are quoted as the app actually renders them. If a
 * behaviour changes, change the article in the same commit.
 *
 * Deliberately honest about what the app does NOT do. A help centre that
 * describes features that do not exist is worse than no help centre, so the
 * limitations are written down: email addresses are never verified, there are
 * no screenshots or rendered audits, there is no member-invitation UI, there is
 * no feedback loop, retention purges are manual, and — the single biggest
 * surprise for new users — a lead you add by hand or import from a CSV has no
 * findings and no score until a campaign researches it.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Block =
  | { kind: "para"; text: string }
  /** Rendered as an ordered list. Use for "do this, then this". */
  | { kind: "steps"; items: string[] }
  | { kind: "bullets"; items: string[] }
  /** Informational MessageBar. */
  | { kind: "note"; text: string }
  /** Warning MessageBar. Use for things that lose work or surprise people. */
  | { kind: "warning"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "terms"; items: { term: string; definition: string }[] }
  /** An in-article section heading. These build the on-page table of contents. */
  | { kind: "heading"; text: string };

export interface Article {
  slug: string;
  title: string;
  /** One or two sentences. Shown on the landing page and inside help tooltips. */
  summary: string;
  section: SectionKey;
  /** Extra search terms: words a user might type that are not in the prose. */
  keywords: string[];
  blocks: Block[];
  /** Slugs of articles to read next. Every entry must resolve. */
  related?: string[];
}

export const HELP_SECTIONS = [
  {
    key: "start",
    title: "Start here",
    description: "What the app does, and how to set it up the first time.",
  },
  {
    key: "leads",
    title: "Leads and data",
    description: "Getting clinics into the app, one at a time or in bulk.",
  },
  {
    key: "research",
    title: "Research and scoring",
    description: "How clinics get researched, and how the score is calculated.",
  },
  {
    key: "drafting",
    title: "Writing emails",
    description: "How a draft is written, what grounds it, and why one gets blocked.",
  },
  {
    key: "sending",
    title: "Review and Gmail",
    description: "Approving a draft, what reaches Gmail, and following up.",
  },
  {
    key: "admin",
    title: "Settings and administration",
    description: "Configuration, roles, and what to do when something looks wrong.",
  },
] as const;

export type SectionKey = (typeof HELP_SECTIONS)[number]["key"];

// ---------------------------------------------------------------------------
// Shared blocks
// ---------------------------------------------------------------------------

/** The app's central promise, repeated wherever sending could be misread. */
const NEVER_SENDS: Block = {
  kind: "note",
  text: "This app never sends an email. Approving a draft creates a draft in your Gmail account. You still open Gmail, read it, and press Send yourself.",
};

/** The single most common surprise. Repeated in all three places it bites. */
const UNSCORED_UNTIL_RESEARCHED: Block = {
  kind: "warning",
  text: "A lead you add by hand or import from a CSV has no findings and no score. Nothing researches a lead on its own, and there is no way to research one clinic on its own. The only thing that produces findings and a score is a campaign, or a finding you write yourself on the lead's Audit tab.",
};

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export const ARTICLES: Article[] = [
  // -------------------------------------------------------------------------
  {
    slug: "getting-started",
    title: "What this app does",
    summary:
      "A tour of the whole workflow: research clinics, score them, write an evidence-backed email, approve it, and finish sending from Gmail yourself.",
    section: "start",
    keywords: [
      "overview",
      "introduction",
      "first time",
      "new user",
      "setup",
      "checklist",
      "workflow",
      "pipeline",
      "onboarding",
    ],
    blocks: [
      {
        kind: "para",
        text: "This app helps you find clinics worth contacting and write a first email to each one that is backed by something you can point at. It does the research and the writing. You make every decision about who to contact and what actually goes out.",
      },
      NEVER_SENDS,
      { kind: "heading", text: "The five stages" },
      {
        kind: "steps",
        items: [
          "Tell the app about your own organization. Settings, then Your AI, covers what you offer, who you are writing to, and the words you want used.",
          "Get clinics into the app. A campaign finds them for you, or you add them by hand or import a CSV.",
          "Research. Running a campaign visits each clinic's website, records what it observes as findings, and turns those findings into a score out of 100.",
          "Write a draft. On a lead, press Generate draft. The app picks the strongest supported angle and writes an email that only says things your findings support.",
          "Review and approve. Read the draft, edit it if you want, then press Approve. That creates a Gmail draft. You open Gmail and send it.",
        ],
      },
      { kind: "heading", text: "Your setup checklist" },
      {
        kind: "para",
        text: "The dashboard shows a checklist of seven things. It reads your real data every time you load the page, so a tick means that thing genuinely exists in your organization right now.",
      },
      {
        kind: "bullets",
        items: [
          "Your AI profile has been reviewed and confirmed.",
          "A Google account is connected.",
          "At least one lead exists.",
          "At least one campaign exists.",
          "At least one lead has been scored.",
          "At least one draft has been generated.",
          "At least one draft has been approved.",
        ],
      },
      { kind: "heading", text: "Words this app uses" },
      {
        kind: "terms",
        items: [
          {
            term: "Lead",
            definition:
              "One clinic. Everything the app knows about it lives on its page: contact details, findings, score, drafts, notes and history.",
          },
          {
            term: "Campaign",
            definition:
              "A saved set of search criteria (categories, place, size). Running it finds clinics, researches them, and scores them.",
          },
          {
            term: "Finding",
            definition:
              "One thing observed about a clinic, with the evidence for it and a link to where it was seen. Findings are what the score is built from and the only thing an email is allowed to talk about.",
          },
          {
            term: "Score",
            definition:
              "A number out of 100 built from the findings. It estimates how good an opportunity this clinic is, not how likely they are to reply.",
          },
          {
            term: "Draft",
            definition:
              "A proposed email held inside this app. It is not in your mailbox and cannot be sent from here.",
          },
        ],
      },
      {
        kind: "para",
        text: "If you would rather be walked through this click by click with your own data in front of you, the guided tutorial covers the same ground as a hands-on walkthrough.",
      },
    ],
    related: ["your-ai", "adding-leads", "campaigns-and-research", "how-scoring-works"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "your-ai",
    title: "Your AI profile",
    summary:
      "The profile that tells the writing engine what you offer, who you are emailing and what it must never say. Your own rules are always added to the built-in ones, never instead of them.",
    section: "start",
    keywords: [
      "profile",
      "guardrails",
      "preset",
      "use case",
      "service pitch",
      "patient referral",
      "referrals",
      "terminology",
      "tone",
      "offerings",
      "PHI",
      "healthcare",
    ],
    blocks: [
      {
        kind: "para",
        text: "Your AI is the profile the writing engine reads before it writes anything. You will find it under Settings, in the card titled Your AI. Changing it needs the Admin role.",
      },
      { kind: "heading", text: "What the profile holds" },
      {
        kind: "terms",
        items: [
          {
            term: "Preset",
            definition:
              "The industry you work in: Healthcare or General. The preset supplies a starting set of offerings, vocabulary and safety rules.",
          },
          {
            term: "Use case",
            definition:
              "Who you are emailing and why: Service pitch or Patient referrals. This changes what the engine is allowed to ground an email in, so it matters more than anything else here.",
          },
          {
            term: "Offerings",
            definition:
              "What you actually offer, in your own words, with an optional supporting link. You can have up to eight. The name you give an offering is the name used throughout the app.",
          },
          {
            term: "Terminology and terms to avoid",
            definition:
              "Words you want used and words you never want to see. A referral practice usually wants patients and practice, never customer or deal.",
          },
          {
            term: "Custom guardrails",
            definition:
              "Extra rules you want followed on every email. These are added to the built-in rules.",
          },
        ],
      },
      { kind: "heading", text: "Guardrails only ever add" },
      {
        kind: "para",
        text: "The rules that apply to a draft are the preset's rules, plus the use case's rules, plus yours. Preset and use-case rules are never copied into your profile. They are re-applied every single time an email is written, from the code, so there is no version of them stored anywhere that you could edit.",
      },
      {
        kind: "para",
        text: "The practical consequence: you can always make the engine stricter, and you can never make it looser. If the Healthcare preset forbids mentioning patient information, no setting in this app will let an email mention patient information.",
      },
      { kind: "heading", text: "The two use cases" },
      {
        kind: "table",
        head: ["", "Service pitch", "Patient referrals"],
        rows: [
          [
            "Who you are writing to",
            "A decision maker at the clinic",
            "A fellow provider who might refer patients to you",
          ],
          [
            "What grounds the email",
            "Opportunities found on their site: Website, Custom software, Phone operations",
            "Verified context about them: Business fit, Contactability, Website",
          ],
          [
            "If there is no evidence",
            "The draft is blocked",
            "An introduction that claims nothing about them is allowed",
          ],
          [
            "Extra rules",
            "None beyond the preset",
            "No patient information at all, no comment on their clinical judgement, no implied existing relationship, no promised outcomes",
          ],
        ],
      },
      {
        kind: "para",
        text: "Service pitch is the harder of the two, on purpose. It refuses to write anything unless the research found a real, supportable opportunity in the area being pitched. Patient referrals is gentler because a referral introduction is mostly about you, not about them, so an email that makes no claim about the recipient is a perfectly good outcome rather than a failure.",
      },
      { kind: "heading", text: "The healthcare rules" },
      {
        kind: "para",
        text: "Choosing the Healthcare preset adds four rules that cannot be removed: never include patient information of any kind, write provider to provider rather than as if the reader were a patient, never give medical advice or promise clinical outcomes, and never claim an accreditation, credential, affiliation or insurance coverage that you did not supply yourself.",
      },
      {
        kind: "para",
        text: "Combining the Healthcare preset with the Patient referrals use case also switches on a scan of the finished email for anything that looks like protected health information. If it finds any, the draft is blocked rather than saved.",
      },
      {
        kind: "warning",
        text: "One thing the profile cannot do is learn. There is a field for notes distilled from your feedback, and the prompt does read it, but nothing in this app ever writes to it. Rating or rejecting a draft does not change how future drafts are written. If you want different output, change the profile yourself.",
      },
    ],
    related: [
      "generating-drafts",
      "evidence-and-claims",
      "settings-overview",
      "why-drafts-get-blocked",
    ],
  },

  // -------------------------------------------------------------------------
  {
    slug: "adding-leads",
    title: "Adding a clinic by hand",
    summary:
      "How to create a single lead, which fields matter, and why a hand-added lead starts with no score until a campaign researches it.",
    section: "leads",
    keywords: [
      "add lead",
      "new lead",
      "create",
      "manual",
      "clinic",
      "contact",
      "duplicate",
      "unscored",
      "no score",
    ],
    blocks: [
      {
        kind: "para",
        text: "Use this when you already know a clinic and just want it in the app. Go to Leads and press Add lead. You need the Member role or higher.",
      },
      UNSCORED_UNTIL_RESEARCHED,
      { kind: "heading", text: "What to fill in" },
      {
        kind: "para",
        text: "Only Clinic name is required. Everything else is optional, but three fields do more work than the rest.",
      },
      {
        kind: "bullets",
        items: [
          "Website URL. This is the strongest thing you can supply. It is what duplicate detection keys on, and it is what research reads if a campaign ever covers this clinic.",
          "Public business email. Without an email address on the lead, a draft can still be written but no Gmail draft can be created from it.",
          "Primary address. If there is no website, the address plus the name is what stops the same clinic being added twice.",
        ],
      },
      {
        kind: "para",
        text: "The rest of the form covers Category, Main phone, Contact page URL, Booking method, Online booking URL, Number of locations, Stage, an optional contact person with their Job title and email, and an Initial note. You can change any of it later from the lead's Edit page.",
      },
      { kind: "heading", text: "How duplicates are prevented" },
      {
        kind: "para",
        text: "Every lead gets an identity key, worked out in this order: the website's domain if there is one, otherwise the cleaned-up name plus the cleaned-up address, otherwise just the cleaned-up name. Cleaning strips punctuation, case and filler words such as clinic, centre, medical and group.",
      },
      {
        kind: "para",
        text: "Your database enforces that key as unique within your organization, so the same clinic cannot be stored twice even if two people add it at the same moment. In practice that means a clinic entered as Riverside Medical Clinic and again as riverside medical will collide, and one with a website will collide with any other entry sharing that domain.",
      },
      { kind: "heading", text: "Getting a score onto it" },
      {
        kind: "para",
        text: "You have two options, and neither happens automatically.",
      },
      {
        kind: "steps",
        items: [
          "Include the clinic in a campaign. Build a campaign whose criteria match it, and run the campaign. Research will visit the site, record findings and score it.",
          "Write findings yourself. Open the lead, go to its Audit tab, and use Add a manual finding. You choose the category, the confidence, the finding text, the evidence, a source URL and the points. Saving a manual finding recalculates the score immediately.",
        ],
      },
      {
        kind: "note",
        text: "A manual finding needs a reason, which goes into the audit log for that lead. That record cannot be edited or deleted afterwards.",
      },
    ],
    related: ["csv-import", "campaigns-and-research", "how-scoring-works", "findings-and-confidence"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "csv-import",
    title: "Importing a CSV",
    summary:
      "Bring in many clinics at once from a spreadsheet: which column headings are recognised, what happens to duplicates and bad rows, and why imported leads are unscored.",
    section: "leads",
    keywords: [
      "csv",
      "import",
      "spreadsheet",
      "bulk",
      "upload",
      "headers",
      "columns",
      "duplicates",
      "excel",
    ],
    blocks: [
      {
        kind: "para",
        text: "Go to Leads, then Import CSV. Choose a file and press Import CSV. You need the Member role or higher. The file must be 4 MB or smaller.",
      },
      UNSCORED_UNTIL_RESEARCHED,
      { kind: "heading", text: "Column headings" },
      {
        kind: "para",
        text: "Headings are matched without regard to capitalisation, and several spellings are accepted for each field. Columns the app does not recognise are ignored rather than causing an error, so you can import an export from another system without tidying it first.",
      },
      {
        kind: "table",
        head: ["Field", "Headings that work"],
        rows: [
          ["Clinic name (required)", "name"],
          ["Category", "category"],
          ["Website", "website"],
          ["Phone", "phone"],
          ["Public email", "email"],
          ["Contact page", "contact page"],
          ["Booking method", "booking method"],
          ["Address", "address"],
          ["Contact person", "contact name, contact, owner, manager, director"],
          ["Their job title", "contact title, title, job title, role"],
          ["Their email", "contact email, owner email, manager email"],
        ],
      },
      { kind: "heading", text: "What happens to each row" },
      {
        kind: "bullets",
        items: [
          "A row with a clinic name that is new to your organization is created as a lead, marked with the source CSV import.",
          "A row that matches an existing lead's identity key is skipped silently and counted. You are told how many were skipped, but not which ones.",
          "A row that fails validation, usually because the name is missing or a field is far too long, is not imported. Those rows are listed back to you by their line number in the file.",
          "Duplicates inside the file itself are also caught. If the same clinic appears twice in one CSV, the first one is created and the second is counted as a duplicate.",
        ],
      },
      {
        kind: "warning",
        text: "Skipped duplicates are counted, not named. If your import reports fewer leads created than rows in your file, the difference is duplicates plus invalid rows. Search Leads for a few of the names to see which ones were already there.",
      },
      { kind: "heading", text: "After the import" },
      {
        kind: "para",
        text: "Your leads are in the app with their contact details, and that is all. They have no findings, no score, no recommendation, and generating a draft on one of them will be blocked for lack of evidence. Build a campaign that covers them and run it, or add findings yourself on each lead's Audit tab.",
      },
      {
        kind: "note",
        text: "An email address in your CSV is stored as unverified and stays that way. Nothing in this app ever checks whether an address is real or deliverable. Treat every address as unconfirmed.",
      },
    ],
    related: ["adding-leads", "campaigns-and-research", "how-scoring-works", "troubleshooting"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "campaigns-and-research",
    title: "Campaigns and research",
    summary:
      "A campaign is the only thing that researches clinics. Learn how to set the criteria, run it, watch progress, and what happens when a site cannot be read.",
    section: "research",
    keywords: [
      "campaign",
      "research",
      "discovery",
      "run",
      "pause",
      "resume",
      "cancel",
      "jobs",
      "progress",
      "criteria",
      "keywords",
      "radius",
    ],
    blocks: [
      {
        kind: "para",
        text: "A campaign is a saved description of the clinics you want. Running it finds matching clinics, visits each one's website, records what it observes, and scores them. This is the only path to a researched, scored lead.",
      },
      { kind: "heading", text: "Building a campaign" },
      {
        kind: "para",
        text: "Go to Campaigns, then New campaign. Creating one needs the Member role; running one needs Admin.",
      },
      {
        kind: "bullets",
        items: [
          "Campaign name and Clinic categories are required. Categories are tick boxes drawn from the app's list of clinic types, such as Physiotherapy, Dental or Walk-in clinic.",
          "City, Province or state, Country and Search radius (km) define where to look.",
          "Maximum leads caps how many clinics the run will bring in. It defaults to 25 and cannot exceed 200.",
          "Minimum locations filters out single-site clinics when you only want groups.",
          "Required keywords and Excluded keywords narrow the results further. Excluding hospital and veterinary is a common starting point.",
        ],
      },
      { kind: "heading", text: "Running it" },
      {
        kind: "para",
        text: "Open the campaign and press Run research. Once it has run at least once, the same button reads Run again. While it is running you get Pause and Cancel; while it is paused you get Resume and Cancel.",
      },
      {
        kind: "steps",
        items: [
          "Discovery. The app searches for clinics matching your criteria and filters out ones already in your organization, using the same identity key that prevents duplicate leads.",
          "Enrichment. Each remaining clinic is fetched and read. Observations become findings, each with the evidence behind it and a link to where it was seen.",
          "Scoring. Those findings are run through the scoring rules, producing a score out of 100 and a recommended area to pitch.",
        ],
      },
      {
        kind: "note",
        text: "Each clinic is saved as it finishes. If a run fails partway, or you cancel it, everything completed so far is already stored. Nothing is thrown away.",
      },
      { kind: "heading", text: "When something goes wrong" },
      {
        kind: "bullets",
        items: [
          "One unreachable website never stops the campaign. That clinic is recorded as failed and the run moves on.",
          "Temporary problems such as a timeout are retried. Permanent ones, such as a site that refuses automated access, are recorded and skipped.",
          "Re-running a campaign does not repeat work that already succeeded, so a restarted or resumed run picks up where it stopped rather than starting over.",
          "The run respects each site's robots rules and its own crawl delay.",
        ],
      },
      { kind: "heading", text: "Watching a run" },
      {
        kind: "para",
        text: "The Jobs page lists every run with its status, progress, and how many clinics succeeded, failed or were skipped as duplicates. Statuses you will see are Queued, Running, Paused, Completed, Partially completed, Failed and Cancelled. Partially completed means some clinics were researched and some were not.",
      },
      {
        kind: "warning",
        text: "Automated discovery needs a Google Places key configured on the server. Without it the Run research button is disabled and hovering it tells you so. Nothing is invented in its place: the app will not fabricate clinics.",
      },
      { kind: "heading", text: "After a run" },
      {
        kind: "para",
        text: "Two Admin-only bulk actions exist. Rescore campaign re-runs the scoring rules over every lead the campaign found, which is what you want after changing your scoring weights. Bulk generate drafts writes a draft for each qualifying lead in one go, applying exactly the same evidence rules as generating them one by one.",
      },
      {
        kind: "note",
        text: "Deleting a campaign keeps the leads it discovered. They stay in your Leads list, just no longer linked to a campaign.",
      },
    ],
    related: ["how-scoring-works", "findings-and-confidence", "generating-drafts", "troubleshooting"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "how-scoring-works",
    title: "How the score is calculated",
    summary:
      "The score out of 100 comes from five capped categories, thirty-one rules and two separate confidence gates. Every point traces back to a specific finding.",
    section: "research",
    keywords: [
      "score",
      "scoring",
      "points",
      "rules",
      "categories",
      "caps",
      "weights",
      "recommendation",
      "override",
      "threshold",
      "100",
    ],
    blocks: [
      {
        kind: "para",
        text: "The score is arithmetic, not a judgement call. The same findings always produce the same number, and you can trace every single point back to the finding that earned it. Open a lead and look at its Audit tab to see the whole calculation.",
      },
      { kind: "heading", text: "Five categories" },
      {
        kind: "para",
        text: "Findings are sorted into five categories. Each has a ceiling, and the ceilings add up to 100. A category cannot contribute more than its ceiling no matter how many findings land in it, which stops one loud signal from swamping the score.",
      },
      {
        kind: "table",
        head: ["Category", "Most it can contribute", "What it measures"],
        rows: [
          ["Website", "30", "Booking, mobile readiness, speed, links, metadata, contact details"],
          ["Custom software", "25", "Multiple sites, manual intake, paper forms, disconnected systems"],
          ["Phone operations", "25", "Call-first booking, several numbers, routing complexity"],
          ["Contactability", "10", "Whether you can actually reach someone, and how directly"],
          ["Business fit", "10", "Right type of clinic, right area, active, right size"],
        ],
      },
      { kind: "heading", text: "Thirty-one rules" },
      {
        kind: "para",
        text: "Each category contains rules. There are thirty-one in the default set. A rule has a name, a point value, and a minimum confidence it demands of the evidence. No clear online booking is worth 8 points, the largest single rule; No HTTPS is worth 3 but insists the evidence be verified.",
      },
      { kind: "heading", text: "Two separate confidence gates" },
      {
        kind: "para",
        text: "This is the part worth understanding properly, because it catches people out. Confidence is applied twice, in two different ways.",
      },
      {
        kind: "steps",
        items: [
          "The gate. If a finding's confidence is below what the rule demands, that finding scores absolutely nothing. It is not reduced, it is refused. It is recorded separately as a rejected finding so you can see it was considered.",
          "The multiplier. A finding that clears the gate then has its points multiplied by its confidence.",
        ],
      },
      {
        kind: "table",
        head: ["Confidence", "Multiplier", "8 points becomes"],
        rows: [
          ["Verified", "1", "8"],
          ["Strong inference", "0.75", "6"],
          ["Weak inference", "0.5", "4"],
          ["Unknown", "0", "0"],
        ],
      },
      {
        kind: "para",
        text: "So a rule that demands verified evidence, given strong-inference evidence, contributes zero, not six. The gate refused it before the multiplier ever came up. At the bottom of the breakdown the app tells you how many findings scored nothing for this reason.",
      },
      { kind: "heading", text: "The recommendation" },
      {
        kind: "para",
        text: "The score also picks which area to pitch, using only the three opportunity categories: Website, Custom software and Phone operations. Contactability and Business fit add to the score but are never pitched, because being reachable is not a problem you can help with.",
      },
      {
        kind: "bullets",
        items: [
          "An area must reach 8 points to be recommended at all. If even the strongest area is below 8, the recommendation is None and no draft can be written from it.",
          "If the two strongest areas both reach 8 and are within 4 points of each other, the recommendation is Combined and the email covers both.",
          "Otherwise the strongest area is recommended on its own.",
        ],
      },
      { kind: "heading", text: "Score confidence" },
      {
        kind: "para",
        text: "Beside the score sits a separate badge: High confidence, Medium confidence or Low confidence. It answers a different question. Not how big is the opportunity, but how much of that number rests on verified fact rather than inference.",
      },
      {
        kind: "bullets",
        items: [
          "High confidence: at least 60 percent of the points came from verified findings.",
          "Medium confidence: at least 30 percent.",
          "Low confidence: below 30 percent, or no points at all.",
        ],
      },
      {
        kind: "para",
        text: "A score of 72 with Low confidence and a score of 48 with High confidence are telling you very different things. The first is a guess worth checking; the second is smaller but solid.",
      },
      UNSCORED_UNTIL_RESEARCHED,
      { kind: "heading", text: "Changing the score" },
      {
        kind: "para",
        text: "Admins have two levers. Settings, then Lead scoring, changes the point values, the category ceilings, the confidence multipliers and the 8-point threshold for everyone; existing scores keep the ruleset version that produced them until they are recalculated. On an individual lead, Override score and recommendation sets a number or a service by hand, and always requires a written reason that goes into that lead's audit log.",
      },
      {
        kind: "warning",
        text: "An override changes which area gets pitched. It does not create evidence. Override a lead to an area with no findings behind it and the draft will be blocked rather than invented.",
      },
      {
        kind: "para",
        text: "Anyone with the Member role can press Recalculate to re-run the rules against the current findings, which is what you want after dismissing a finding or adding one by hand.",
      },
    ],
    related: ["findings-and-confidence", "campaigns-and-research", "evidence-and-claims", "roles-and-permissions"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "findings-and-confidence",
    title: "Findings and confidence levels",
    summary:
      "A finding is one observation with the evidence behind it. Its confidence level decides both what it is worth in the score and whether an email may mention it.",
    section: "research",
    keywords: [
      "finding",
      "findings",
      "evidence",
      "confidence",
      "verified",
      "inference",
      "fact",
      "dismiss",
      "manual finding",
      "audit",
      "source",
    ],
    blocks: [
      {
        kind: "para",
        text: "A finding is the smallest unit of knowledge in the app. One observation about one clinic, with the evidence for it and a link to where it was seen. Findings are the foundation: the score is built from them, and an email may only talk about things they support.",
      },
      { kind: "heading", text: "What a finding contains" },
      {
        kind: "terms",
        items: [
          {
            term: "Finding",
            definition: "The observation in one line, such as No clear online booking.",
          },
          {
            term: "Evidence",
            definition: "What was actually seen that supports it.",
          },
          {
            term: "Source",
            definition:
              "The page it came from. Findings you add by hand show manual-entry unless you supply a URL.",
          },
          {
            term: "Category",
            definition: "Which of the five scoring categories it belongs to.",
          },
          {
            term: "Confidence",
            definition: "How certain this is. Four levels, described below.",
          },
        ],
      },
      { kind: "heading", text: "The four confidence levels" },
      {
        kind: "table",
        head: ["Level", "Counts as", "Worth", "Can an email mention it"],
        rows: [
          ["Verified", "Fact", "Full points", "Yes"],
          ["Strong inference", "Inference", "Three quarters", "Yes"],
          ["Weak inference", "Inference", "Half", "No"],
          ["Unknown", "Inference", "Nothing", "No"],
        ],
      },
      {
        kind: "para",
        text: "Only Verified counts as a fact. Everything else is an inference, however strong. That distinction runs through the whole app: the Fact and Inference badges on each finding, the share of verified points that sets the score confidence, and the safety check that refuses to let an email assert lost revenue unless a verified finding backs it.",
      },
      {
        kind: "note",
        text: "Weak inferences still contribute to the score, at half value, if the rule they fire allows weak evidence. They are simply never repeated back to a clinic in an email. Scoring is a private estimate; an email is a public claim, so the bar is higher.",
      },
      { kind: "heading", text: "How findings are grouped" },
      {
        kind: "para",
        text: "On a lead's Audit tab, findings are shown in three groups: Facts, Inferences, and Dismissed if there are any. Each one shows its category, its confidence, whether it is a fact or an inference, whether it was added by hand, how many points it contributed, and a link to its source.",
      },
      { kind: "heading", text: "Dismissing a finding" },
      {
        kind: "para",
        text: "If a finding is wrong, dismiss it. That has two effects, and the second is the important one.",
      },
      {
        kind: "bullets",
        items: [
          "Its points stop counting towards the score once you recalculate.",
          "Any draft that tries to cite it is blocked outright. A dismissed finding is not merely ignored by the writing engine, it is specifically watched for.",
        ],
      },
      {
        kind: "para",
        text: "Dismissing needs a reason, and it is reversible. Dismissed findings stay visible in their own group and can be restored. Both actions are written to the lead's audit log with your name, and that log cannot be edited.",
      },
      { kind: "heading", text: "Adding a finding yourself" },
      {
        kind: "para",
        text: "Use Add a manual finding on the Audit tab when you know something research could not see, such as what a receptionist told you on the phone. You choose the Category, the Confidence, the Finding text, the Evidence, an optional Source URL, the Points between 0 and 30, and a Reason for the audit log.",
      },
      {
        kind: "warning",
        text: "Your chosen confidence still applies the multiplier. Ten points at Weak inference contributes five. If you know something first-hand and can say where it came from, Verified is the honest level. Do not inflate confidence to move the score; use the override on the score itself instead, where it is recorded as an override.",
      },
      {
        kind: "para",
        text: "A manual finding is also perfectly good evidence for an email, provided you set it to Verified or Strong inference and wrote a real observation rather than an opinion.",
      },
    ],
    related: ["how-scoring-works", "evidence-and-claims", "why-drafts-get-blocked", "adding-leads"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "generating-drafts",
    title: "Generating a draft",
    summary:
      "Drafting happens in two stages. The first picks the angle using plain code with no AI at all, and if it finds nothing to say the model is never even asked.",
    section: "drafting",
    keywords: [
      "draft",
      "generate",
      "email",
      "write",
      "regenerate",
      "two stage",
      "strategy",
      "confidence",
      "AI",
      "model",
      "word count",
    ],
    blocks: [
      {
        kind: "para",
        text: "Open a lead and find the draft area. If there is no draft yet you will see No draft yet and a Generate draft button. Generating needs the Member role.",
      },
      { kind: "heading", text: "Stage one: choosing the angle" },
      {
        kind: "para",
        text: "Before any AI is involved, ordinary code decides what this email could honestly be about. It reads the stored score, the recommendation, every finding, and any override you set, and it answers one question: is there something here worth saying, and what is it?",
      },
      {
        kind: "bullets",
        items: [
          "It takes the recommended area, honouring your override if you set one.",
          "It collects the findings in that area that are allowed to be cited, which means not dismissed and rated Verified or Strong inference.",
          "It sorts them so verified facts come first.",
          "If that collection is empty, the answer is insufficient evidence.",
        ],
      },
      {
        kind: "note",
        text: "When stage one returns insufficient evidence, the AI model is never called. Not called and then rejected. Never called. The draft is blocked immediately with the reason. This is why an unresearched lead cannot produce an email of any kind.",
      },
      { kind: "heading", text: "Stage two: writing it" },
      {
        kind: "para",
        text: "Only if stage one found something does the model run. It receives the chosen observations, your AI profile, your company details and your email voice settings, and it must write the email using only those observations. It also has to label each sentence with the finding it came from.",
      },
      {
        kind: "para",
        text: "Whatever comes back is then checked line by line against your stored findings. Every labelled claim must map to a real finding that is still allowed to be cited. That check is separate code, not the model marking its own work.",
      },
      { kind: "heading", text: "Reading the result" },
      {
        kind: "para",
        text: "Above the draft sits a row of badges: its status, the area being pitched, a confidence figure out of 100, the version number, and the word count. Below the email you will see Strategy, which is stage one explaining in plain words why it chose this angle, and Evidence used, listing each claim with the finding behind it and a link to the source.",
      },
      { kind: "heading", text: "What the confidence number means" },
      {
        kind: "para",
        text: "The draft confidence is calculated, not estimated. It starts at 35 if every supporting observation is an inference and rises to 90 if every one is a verified fact. Each review warning takes off 3. A blocked draft is capped at 20.",
      },
      {
        kind: "warning",
        text: "This number measures how well grounded the email is. It says nothing whatsoever about how likely anyone is to reply. A confidence of 88 means the claims are solid, not that the email will work.",
      },
      { kind: "heading", text: "What you can do with a draft" },
      {
        kind: "bullets",
        items: [
          "Edit rewrites the subject and body yourself. Your edit is checked against the same safety rules, and a version is kept.",
          "Copy puts the subject and body on your clipboard.",
          "Regenerate throws away the current text and writes a fresh one from the same findings. Use it after dismissing a finding or fixing the profile.",
          "Reject records the draft as rejected with a reason you type. It needs the Member role.",
          "Approve creates the Gmail draft. It needs the Admin role.",
        ],
      },
      {
        kind: "para",
        text: "Every change is versioned. Show version history lists each version with who made it, when, and why, with a preview and a Restore this version button.",
      },
      {
        kind: "note",
        text: "Drafting needs an Anthropic API key configured on the server. Without it you will see AI drafting is not configured, and nothing is generated. The app will not fall back to a fake or templated email when the model is unavailable.",
      },
      { kind: "heading", text: "Drafting many at once, then reviewing them" },
      {
        kind: "para",
        text: "Generating drafts one lead at a time is fine for a handful. For a whole campaign, open Review drafts in the sidebar and use the Generate button at the top. It writes a draft for every qualifying lead that does not already have one, and the number on the button is exactly how many it will attempt.",
      },
      {
        kind: "steps",
        items: [
          "Open Review drafts and press Generate drafts. The work runs in the background, so you can leave the page.",
          "Watch Drafting progress, or carry on and come back later.",
          "Return to Review drafts. The Needs review tab fills up as drafts land, strongest lead first.",
          "Work down the queue. Press j for the next draft and k for the previous one, or use Previous and Next.",
          "Approve, reject or edit each one. Approving moves it to the Approved tab and out of your way.",
        ],
      },
      {
        kind: "note",
        text: "Generating in bulk never touches a lead that already has a draft, so it is safe to press again after a campaign discovers more clinics. It will not regenerate anything you have already reviewed, and it will not overwrite an approval.",
      },
      {
        kind: "para",
        text: "The Blocked tab is worth a look after any bulk run. Those are drafts the safety checks refused, most often because the lead had no citable evidence in the area being pitched. They cannot be approved until you edit or regenerate them.",
      },
    ],
    related: ["evidence-and-claims", "why-drafts-get-blocked", "review-warnings", "approving-and-gmail"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "evidence-and-claims",
    title: "Evidence and claims",
    summary:
      "Every sentence about a clinic has to trace back to a stored finding. This explains which findings qualify, and why a manual override never counts as evidence.",
    section: "drafting",
    keywords: [
      "evidence",
      "claims",
      "citable",
      "grounded",
      "hallucination",
      "override",
      "claim map",
      "sources",
      "proof",
    ],
    blocks: [
      {
        kind: "para",
        text: "The rule the whole app is built around: an email may not say anything about a clinic that a stored finding does not support. Not a softened version, not a reasonable guess. If there is no finding behind it, it does not go in the email.",
      },
      { kind: "heading", text: "Which findings count as evidence" },
      {
        kind: "para",
        text: "A finding may be cited only if both of these are true.",
      },
      {
        kind: "bullets",
        items: [
          "It has not been dismissed.",
          "Its confidence is Verified or Strong inference.",
        ],
      },
      {
        kind: "para",
        text: "Weak inferences and unknowns are excluded on purpose. They can still add to the score, because a score is an internal estimate. An email is a claim made to a stranger about their own business, so the bar is set higher.",
      },
      { kind: "heading", text: "An override is not evidence" },
      {
        kind: "para",
        text: "This trips people up, so it is worth being blunt. Overriding a lead's recommended service changes which area gets pitched. It does not create anything to say about that area.",
      },
      {
        kind: "para",
        text: "Override a lead to Phone operations when every finding is about their website, and the draft is blocked with a message saying exactly that: an override does not by itself create evidence. The app would rather refuse than invent a phone problem it never observed. If you genuinely know about one, add it as a manual finding, then generate.",
      },
      { kind: "heading", text: "Claim mapping" },
      {
        kind: "para",
        text: "The model must tag every sentence with the finding it rests on. Sentences that say nothing about the clinic, such as your own introduction or the closing question, are tagged as general and need no evidence. Everything else is checked.",
      },
      {
        kind: "bullets",
        items: [
          "A claim tagged with a finding that does not exist blocks the draft.",
          "A claim tagged with a finding that is not allowed to be cited blocks the draft.",
          "A claim tagged with a finding you dismissed blocks the draft, and says which one.",
        ],
      },
      { kind: "heading", text: "Evidence used" },
      {
        kind: "para",
        text: "Under each draft is the Evidence used list: the claims that survived, each with its category, its confidence, a Fact or Inference badge, and a link to the page it came from. Before approving anything, read that list against the email. It is the shortest way to satisfy yourself that every statement is defensible.",
      },
      {
        kind: "note",
        text: "If your offering has a supporting link in the AI profile, the draft is asked to include it. A missing link is a warning rather than a block, because a good email without a link is still a good email.",
      },
      { kind: "heading", text: "Combined pitches" },
      {
        kind: "para",
        text: "When the score recommends Combined, stage one checks that both areas genuinely have citable evidence. If only one does, it quietly drops back to pitching that single area rather than padding the email to cover both. It never forces every service you offer into one message.",
      },
    ],
    related: ["findings-and-confidence", "why-drafts-get-blocked", "generating-drafts", "how-scoring-works"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "why-drafts-get-blocked",
    title: "Why a draft gets blocked",
    summary:
      "The complete list of things that stop a draft being usable, what each one means in plain terms, and how to fix it.",
    section: "drafting",
    keywords: [
      "blocked",
      "block",
      "rejected",
      "safety",
      "guard",
      "insufficient evidence",
      "placeholder",
      "PHI",
      "scraping",
      "impersonation",
      "clinic name",
    ],
    blocks: [
      {
        kind: "para",
        text: "A blocked draft is the app refusing to hand you something it cannot stand behind. You will see a red Draft blocked message with the reason. Blocked drafts cannot be approved; you must fix the cause, then edit or regenerate.",
      },
      { kind: "heading", text: "The block that happens first" },
      {
        kind: "para",
        text: "Insufficient evidence. This one occurs before the model is called at all, and it is by far the most common. There was nothing citable in the area being pitched, so there was nothing to write.",
      },
      {
        kind: "bullets",
        items: [
          "The lead has never been researched. A hand-added or imported lead has no findings until a campaign covers it.",
          "The strongest area scored below the 8-point threshold, so the recommendation is None.",
          "Every finding in the pitched area is a weak inference, an unknown, or dismissed.",
          "You overrode the service to an area with no findings behind it.",
        ],
      },
      {
        kind: "para",
        text: "Fix it by researching the lead, restoring a finding you dismissed too eagerly, adding a manual finding you can stand behind, or removing an override that does not match the evidence.",
      },
      { kind: "heading", text: "The six checks on the finished email" },
      {
        kind: "para",
        text: "If the model does write something, the result is checked before it is saved. Any of these blocks it.",
      },
      {
        kind: "table",
        head: ["Block", "What it means", "What to do"],
        rows: [
          [
            "A claim has no supporting evidence",
            "A sentence about the clinic cites a finding that does not exist, or one that is not allowed to be cited.",
            "Regenerate. If it keeps happening, check whether the area you are pitching really has verified or strong findings.",
          ],
          [
            "A claim relies on a dismissed finding",
            "The email leaned on something you marked as wrong. The message names the finding.",
            "Regenerate, so it writes from what is left. Or restore the finding if dismissing it was a mistake.",
          ],
          [
            "Lost calls, lost revenue or operational failure claimed without verified evidence",
            "The email asserted they are losing patients, missing calls or losing money, and no verified fact backs it.",
            "Either verify the finding that would support it, or regenerate so the claim is dropped. Never wave this one through.",
          ],
          [
            "The email mentions how their information was gathered",
            "Wording such as we found your or references to crawling. Nobody wants to read that you scraped their site.",
            "Regenerate, or edit the sentence out.",
          ],
          [
            "The email pretends to be a patient or fakes familiarity",
            "Phrasing such as as a potential patient or I called your clinic, which implies a relationship you do not have.",
            "Regenerate. If you genuinely did call them, say so in your own words in an edit.",
          ],
          [
            "The clinic's exact name is missing, or a placeholder was left in",
            "The clinic's name is not in the body as written, or something like [Clinic Name] survived.",
            "Regenerate. This almost always clears on a second attempt.",
          ],
        ],
      },
      { kind: "heading", text: "The extra healthcare check" },
      {
        kind: "para",
        text: "If your use case is Patient referrals, one more check runs: the email is scanned for anything resembling protected health information. Record numbers, dates of birth, references to a patient's chart, or naming a specific patient will all block the draft. This scan is deliberately narrow, so ordinary referral language such as describing what you treat is untouched.",
      },
      { kind: "heading", text: "Your own edits are checked too" },
      {
        kind: "warning",
        text: "Editing a draft does not bypass any of this. Your text goes through the same checks, and an edit can block a draft that was previously fine. If that happens the edit is still saved, and you are told it was blocked, so nothing you typed is lost.",
      },
      {
        kind: "note",
        text: "Two things a block never means. It is not a judgement on your writing, and it is not something you can turn off. There is no setting anywhere that disables these checks.",
      },
    ],
    related: ["evidence-and-claims", "review-warnings", "generating-drafts", "findings-and-confidence"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "review-warnings",
    title: "Review warnings",
    summary:
      "Warnings are the app raising an eyebrow, not slamming a door. A draft with warnings can still be approved, but each one costs three points of confidence.",
    section: "drafting",
    keywords: [
      "warning",
      "warnings",
      "review",
      "em dash",
      "urgency",
      "word count",
      "length",
      "recipient email",
      "inference",
    ],
    blocks: [
      {
        kind: "para",
        text: "Under a draft you may see a Review warnings list. A warning does not stop anything. It is a judgement call handed back to you, because the app can tell something is off but cannot tell whether it matters here.",
      },
      {
        kind: "para",
        text: "Each warning takes three points off the draft's confidence figure, which is why a well-grounded draft can still show a middling number.",
      },
      { kind: "heading", text: "Every warning you can see" },
      {
        kind: "table",
        head: ["Warning", "Why it appears", "What to do"],
        rows: [
          [
            "Contains an em dash",
            "An em dash is in the subject or body. It reads as machine-written to a lot of people.",
            "Edit it into a comma, a full stop or a pair of brackets.",
          ],
          [
            "Contains urgency wording",
            "Phrases such as act now, limited time, urgent, don't miss, expires or last chance.",
            "Soften it. Manufactured urgency in a first email to a clinic reads badly.",
          ],
          [
            "Body is N words; the target is X to Y",
            "The email is outside the length band your Email voice setting asks for.",
            "Trim or expand it, or change the length in Settings under Email voice if the band is wrong for you.",
          ],
          [
            "The draft is missing the supporting link",
            "Your offering has a supporting link in the AI profile and the email does not include it.",
            "Add the link in an edit, or regenerate.",
          ],
          [
            "Wording rests on inference-level evidence",
            "Every finding the email used is a strong inference. Nothing verified is behind it.",
            "Check the claims yourself before approving. This is the warning worth taking most seriously.",
          ],
          [
            "No verified recipient email",
            "There is no email address on the lead, so no Gmail draft can be created.",
            "Add a public business email to the lead, or a contact with an email address.",
          ],
        ],
      },
      { kind: "heading", text: "How to use them" },
      {
        kind: "para",
        text: "Treat the inference warning as a genuine prompt to go and look. The others are style, and you can override any of them by deciding the email is fine as it stands. Approving does not require you to clear a single warning.",
      },
      {
        kind: "warning",
        text: "Warnings are not recalculated when you approve. They were worked out when the draft was generated or last edited, so they always describe the text in front of you. Editing re-runs them.",
      },
      {
        kind: "note",
        text: "The email address warning is about absence, not validity. This app never checks whether an address is real or deliverable, so no warning will ever tell you an address is wrong. Every address here is unconfirmed.",
      },
    ],
    related: ["generating-drafts", "why-drafts-get-blocked", "approving-and-gmail", "settings-overview"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "approving-and-gmail",
    title: "Approving a draft and what reaches Gmail",
    summary:
      "Approving creates a draft in your Gmail account and nothing more. The app asked Google for permission to compose and deliberately never asked for permission to send.",
    section: "sending",
    keywords: [
      "approve",
      "gmail",
      "send",
      "google",
      "oauth",
      "scopes",
      "compose",
      "draft",
      "suppression",
      "do not contact",
      "unsubscribe",
      "version",
    ],
    blocks: [
      {
        kind: "para",
        text: "Approving is the last thing this app does with an email. It needs the Admin role.",
      },
      NEVER_SENDS,
      { kind: "heading", text: "The permission that makes this true" },
      {
        kind: "para",
        text: "When you connect your Google account, the app asks for permission to compose Gmail drafts. It explicitly does not ask for permission to send. That is not a policy someone could change in a settings page; it is the scope of the access Google granted.",
      },
      {
        kind: "para",
        text: "The only Gmail endpoint this app ever touches is the one that creates drafts. Even if something in the app tried to send a message, the access token it holds would not allow it.",
      },
      { kind: "heading", text: "What happens when you press Approve" },
      {
        kind: "steps",
        items: [
          "The draft is marked approved, with your name and the time.",
          "The Gmail safety checks run.",
          "If they all pass, a draft appears in your Gmail account.",
          "The lead's stage moves from Approved to Gmail draft created.",
          "A new tab opens on your Gmail drafts, ready for you to read and send.",
        ],
      },
      {
        kind: "para",
        text: "The button reads Approve and open in Gmail when Gmail is connected, and simply Approve when it is not. The lead's stage never moves to Contacted by itself. Nothing in this app can know whether you actually pressed Send.",
      },
      { kind: "heading", text: "Seven reasons a Gmail draft is not created" },
      {
        kind: "para",
        text: "The approval still succeeds and is recorded; you are told the Gmail draft was not created and why.",
      },
      {
        kind: "table",
        head: ["Reason", "Fix"],
        rows: [
          ["The draft is not approved, or was changed after approval", "Approve the current version."],
          ["The lead has no recipient email", "Add a public email, or a contact with one."],
          ["The recipient email is not a valid address", "Correct it on the lead."],
          ["The lead is marked do-not-contact", "This is deliberate. Do not work around it."],
          ["The recipient is on the suppression list", "This is deliberate. Do not work around it."],
          ["The recipient has an unsubscribe record", "This is deliberate. Do not work around it."],
          ["No authorised Google account is connected", "Connect Google under Settings, Integrations."],
        ],
      },
      {
        kind: "warning",
        text: "The last three are compliance decisions, not obstacles. If a clinic is marked do-not-contact, suppressed or unsubscribed, they have been excluded on purpose. Emailing them from your own mailbox to get around this defeats the point of recording it.",
      },
      { kind: "heading", text: "Versions and re-approval" },
      {
        kind: "para",
        text: "Exactly one Gmail draft is created per version of an approved draft. Press Approve twice and you get one Gmail draft, not two; the app tells you one already existed.",
      },
      {
        kind: "para",
        text: "Editing an approved draft bumps its version and returns it to review, clearing the approval. That is intentional. Approval attaches to a specific text, so changing the text means someone has to approve the new one.",
      },
      {
        kind: "note",
        text: "If creating the Gmail draft fails, the failure is recorded on the lead and you can try again. The approval itself is never rolled back, so you never lose the review that already happened.",
      },
      { kind: "heading", text: "After you send" },
      {
        kind: "para",
        text: "Once you have sent from Gmail, come back and move the lead's stage yourself: Contacted manually, and later Replied, Meeting booked, Not interested or Follow up later. The app cannot see your mailbox, so these stages are yours to maintain.",
      },
    ],
    related: ["generating-drafts", "review-warnings", "follow-ups", "roles-and-permissions"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "follow-ups",
    title: "Follow-ups and pipeline stages",
    summary:
      "Scheduling a reminder for a lead, optionally putting it in Google Calendar, and keeping the pipeline stage honest once conversations move to your inbox.",
    section: "sending",
    keywords: [
      "follow up",
      "followup",
      "reminder",
      "calendar",
      "stage",
      "pipeline",
      "overdue",
      "assignee",
      "priority",
      "contacted",
    ],
    blocks: [
      {
        kind: "para",
        text: "Once an email leaves your Gmail account, this app has no idea what happens next. Follow-ups and stages are how you keep it informed. Both need the Member role.",
      },
      { kind: "heading", text: "Scheduling a follow-up" },
      {
        kind: "para",
        text: "On a lead, open Schedule follow-up and fill in the Title, the Due date and time, a Priority of Low, Medium or High, an optional Assignee from your organization, and an optional Note.",
      },
      {
        kind: "bullets",
        items: [
          "A follow-up past its due date is badged Overdue.",
          "One that has been put in Google Calendar is badged On calendar.",
          "Cancelling one that was on the calendar shows Calendar cancelled.",
          "Follow-ups can be completed or cancelled, and both are recorded in the lead's history.",
        ],
      },
      {
        kind: "note",
        text: "Calendar sync is separate from Gmail. Connecting Google for Gmail drafts does not grant calendar access; you add it separately under Settings, Integrations. A follow-up without calendar sync still works perfectly well as an in-app reminder.",
      },
      { kind: "heading", text: "Pipeline stages" },
      {
        kind: "para",
        text: "Every lead sits at one stage. Some move on their own, most do not.",
      },
      {
        kind: "table",
        head: ["Stage", "How it is set"],
        rows: [
          ["Discovered", "Automatically, when a lead is created"],
          ["Researching", "Automatically, during a campaign run"],
          ["Qualified", "By you"],
          ["Draft ready", "By you, once a draft is worth reviewing"],
          ["Needs review", "By you"],
          ["Approved", "By you"],
          ["Gmail draft created", "Automatically, when a Gmail draft is created from an approved email"],
          ["Contacted manually", "By you, after you press Send in Gmail"],
          ["Replied, Meeting booked, Not interested, Follow up later, Disqualified", "By you"],
        ],
      },
      {
        kind: "warning",
        text: "Nothing moves a lead to Contacted manually for you. The app cannot see your sent mail, cannot see replies, and cannot see your calendar bookings. If your pipeline looks wrong, it is almost always because these later stages were never updated by hand.",
      },
      { kind: "heading", text: "Changing several at once" },
      {
        kind: "para",
        text: "From the Leads list you can select multiple leads and set their stage together, or mark them do-not-contact together. Do-not-contact is the one to reach for when a clinic asks not to be approached again: it permanently prevents any Gmail draft being created for them.",
      },
      {
        kind: "para",
        text: "Every stage change is written to the lead's activity history with your name and the time, so you can always see who moved what.",
      },
    ],
    related: ["approving-and-gmail", "settings-overview", "roles-and-permissions", "troubleshooting"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "settings-overview",
    title: "A tour of Settings",
    summary:
      "What each card in Settings controls, which ones need the Admin role, and what data retention actually does when you press Purge.",
    section: "admin",
    keywords: [
      "settings",
      "configuration",
      "company profile",
      "email voice",
      "scoring",
      "integrations",
      "retention",
      "compliance",
      "system status",
      "purge",
    ],
    blocks: [
      {
        kind: "para",
        text: "Settings holds eight cards. Almost everything on this page needs the Admin role; without it you can read the page but the controls are not shown.",
      },
      { kind: "heading", text: "The eight cards" },
      {
        kind: "terms",
        items: [
          {
            term: "Your AI",
            definition:
              "What you offer, who you are emailing, your vocabulary and your extra rules. The most consequential settings in the app.",
          },
          {
            term: "Company profile",
            definition:
              "Who you are, as described to the recipient. This is the sender context every email is written from.",
          },
          {
            term: "Email voice",
            definition:
              "Tone and length. The length setting is what the word-count review warning measures against.",
          },
          {
            term: "Lead scoring",
            definition:
              "Point values, category ceilings, confidence multipliers and the recommendation threshold. Changing these affects every future score.",
          },
          {
            term: "Integrations",
            definition:
              "Connect and disconnect Google accounts, and choose which one is the default sender.",
          },
          {
            term: "System status",
            definition:
              "Which server-side keys are configured. Check here first when a feature appears disabled.",
          },
          {
            term: "Data retention",
            definition: "How long stale data is kept, and the controls to remove it.",
          },
          {
            term: "Compliance",
            definition: "Acknowledgement of how this app is meant to be used.",
          },
        ],
      },
      { kind: "heading", text: "Data retention in detail" },
      {
        kind: "para",
        text: "Set a Retention window (days) and press Save retention. That records your policy. It does not delete anything.",
      },
      {
        kind: "warning",
        text: "Nothing is ever purged automatically. There is no scheduled job quietly removing old data on your behalf. Data only leaves when a person presses the button, so if your policy says ninety days, someone has to act on it.",
      },
      {
        kind: "steps",
        items: [
          "Press Preview purge (dry run). Nothing is deleted; you are shown what would be.",
          "Read the numbers. Protected records are excluded from deletion.",
          "Press Purge now, then Confirm purge.",
        ],
      },
      {
        kind: "para",
        text: "Every run, dry or real, is recorded under Recent retention runs with when it happened, which type it was, how many leads and jobs were affected, how many were protected, and who did it.",
      },
      { kind: "heading", text: "Exporting your leads" },
      {
        kind: "para",
        text: "The Leads page has a CSV export, available to anyone with the Member role. It exports up to 5000 leads with their contact details, primary address, first contact, stage, do-not-contact flag, source, follow-up date and creation date.",
      },
      {
        kind: "warning",
        text: "The export honours only some of the filters on screen: whether test data is included, category, stage, and your search text. Filters for score, service, confidence, finding, audit, date range and lead source are silently ignored, so a filtered view can still export more rows than you expect. Check the row count before relying on it.",
      },
      {
        kind: "note",
        text: "There is no screen for inviting people or changing their roles. Memberships are managed outside this app. A brand-new account gets its own organization with you as Owner.",
      },
    ],
    related: ["your-ai", "roles-and-permissions", "how-scoring-works", "troubleshooting"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "roles-and-permissions",
    title: "Roles and permissions",
    summary:
      "Four roles from Viewer to Owner, and exactly which actions each one can take. Owner is worth understanding: it grants nothing beyond Admin.",
    section: "admin",
    keywords: [
      "role",
      "roles",
      "permission",
      "permissions",
      "viewer",
      "member",
      "admin",
      "owner",
      "access",
      "cannot",
      "denied",
    ],
    blocks: [
      {
        kind: "para",
        text: "Your role is shown beside your name at the top right of every page. There are four, and each includes everything the one below it can do: Viewer, then Member, then Admin, then Owner.",
      },
      { kind: "heading", text: "Who can do what" },
      {
        kind: "table",
        head: ["Action", "Lowest role needed"],
        rows: [
          ["View leads, campaigns, scores, drafts and history", "Viewer"],
          ["Add or edit a lead, add notes, contacts and locations", "Member"],
          ["Import a CSV, export a CSV", "Member"],
          ["Change a lead's stage, or mark it do-not-contact", "Member"],
          ["Create a campaign", "Member"],
          ["Recalculate a score", "Member"],
          ["Add a manual finding; dismiss or restore a finding", "Member"],
          ["Generate, regenerate or edit a draft", "Member"],
          ["Reject a draft, or restore an earlier version", "Member"],
          ["Create a Gmail draft from an already-approved email", "Member"],
          ["Schedule, complete or cancel a follow-up", "Member"],
          ["Connect or disconnect a Google account", "Member"],
          ["Approve a draft", "Admin"],
          ["Generate drafts in bulk for a campaign", "Admin"],
          ["Run, pause, resume, cancel or delete a campaign", "Admin"],
          ["Rescore every lead in a campaign", "Admin"],
          ["Override a score, or clear an override", "Admin"],
          ["Edit the scoring rules", "Admin"],
          ["Delete a lead", "Admin"],
          ["Change anything in Settings", "Admin"],
        ],
      },
      { kind: "heading", text: "Why approval is the Admin line" },
      {
        kind: "para",
        text: "Notice where the boundary sits. A Member can write, rewrite and reject drafts all day. What a Member cannot do is approve one, because approval is what puts an email into a mailbox. The same logic explains the other Admin actions: they either delete something, spend money running research, or change the rules everyone else's work is judged by.",
      },
      { kind: "heading", text: "Owner" },
      {
        kind: "note",
        text: "Owner is the top role, and in this app it grants nothing that Admin does not already have. Every permission check in the code asks for Admin or lower; not one asks for Owner. The role exists to mark who created the organization, not to unlock anything.",
      },
      { kind: "heading", text: "When you do not have permission" },
      {
        kind: "para",
        text: "Controls you cannot use are usually hidden rather than disabled, so a Viewer sees a clean read-only page instead of a wall of greyed-out buttons. Where an action is attempted anyway, you get a clear message saying you do not have permission.",
      },
      {
        kind: "warning",
        text: "There is no screen in this app for inviting someone or changing their role. If you need a colleague added, or your own role raised, that has to be arranged outside the app by whoever administers your database.",
      },
      {
        kind: "para",
        text: "If you belong to more than one organization, the switcher at the top of the sidebar moves between them. Your role can differ in each, and every query is scoped to the organization you are currently in, so you never see another organization's leads.",
      },
    ],
    related: ["settings-overview", "approving-and-gmail", "troubleshooting", "getting-started"],
  },

  // -------------------------------------------------------------------------
  {
    slug: "troubleshooting",
    title: "When something is not working",
    summary:
      "The problems people actually hit, what causes each one, and the fastest fix. Start here before assuming something is broken.",
    section: "admin",
    keywords: [
      "problem",
      "error",
      "not working",
      "broken",
      "disabled",
      "missing",
      "help",
      "fix",
      "no score",
      "blocked",
      "cannot",
      "greyed out",
    ],
    blocks: [
      {
        kind: "para",
        text: "Most reports of something being broken turn out to be one of the situations below. Work down the list before escalating.",
      },
      { kind: "heading", text: "A lead has no score" },
      {
        kind: "para",
        text: "This is the single most common question, and it is expected behaviour rather than a fault. Leads you add by hand and leads you import from a CSV have no findings and no score. Nothing researches them on their own, and there is no way to research one clinic by itself.",
      },
      {
        kind: "para",
        text: "Include the clinic in a campaign and run it, or open the lead's Audit tab and add findings yourself.",
      },
      { kind: "heading", text: "A button is disabled or missing" },
      {
        kind: "table",
        head: ["What you see", "Cause", "Fix"],
        rows: [
          [
            "AI drafting is not configured",
            "No Anthropic API key on the server.",
            "Ask whoever runs your deployment to set it. Nothing is generated without it, and no fake email is substituted.",
          ],
          [
            "Run research is disabled",
            "No Google Places key on the server.",
            "Same: this is a server setting. Check Settings, System status.",
          ],
          [
            "Google cannot be connected",
            "The Google client id, client secret or token encryption key is missing.",
            "A server setting. Drafts still generate; only the Gmail step is unavailable.",
          ],
          [
            "No Approve button on a draft",
            "You have the Member role. Approving needs Admin.",
            "Ask an Admin to review and approve it.",
          ],
          [
            "You need an Admin role to run or manage research",
            "Same cause, on a campaign.",
            "Ask an Admin to run it.",
          ],
        ],
      },
      { kind: "heading", text: "A draft will not generate" },
      {
        kind: "para",
        text: "If the message mentions insufficient evidence, there was nothing citable to write from. Check that the lead has been researched, that the strongest area reaches 8 points, that you have not dismissed the findings the email would need, and that any override you set points at an area that actually has evidence.",
      },
      { kind: "heading", text: "Approved, but no Gmail draft" },
      {
        kind: "para",
        text: "The message tells you which of the seven checks failed. Most often it is no recipient email on the lead, or no connected Google account. Do-not-contact, suppression and unsubscribe are deliberate exclusions and should not be worked around.",
      },
      { kind: "heading", text: "The import created fewer leads than my file had rows" },
      {
        kind: "para",
        text: "Duplicates are skipped silently and counted, and rows that fail validation are listed by line number. Together those account for the difference. Duplicate matching uses the website domain where there is one, otherwise the name and address, so the same clinic under two spellings will still collide.",
      },
      { kind: "heading", text: "My CSV export has more rows than the screen showed" },
      {
        kind: "para",
        text: "The export honours only the test-data toggle, category, stage and search text. Filters for score, service, confidence, finding, audit, date range and lead source are ignored by the export. Narrow using the four it does respect, or filter the downloaded file afterwards.",
      },
      { kind: "heading", text: "Things that do not exist" },
      {
        kind: "para",
        text: "If you are hunting for one of these, stop: it is not hidden, it is absent.",
      },
      {
        kind: "bullets",
        items: [
          "Email verification. Addresses are never checked for validity or deliverability, and the status never changes from unverified.",
          "Screenshots, rendered mobile audits, or reports of errors on a clinic's site. Research reads a page's contents; it never opens a browser.",
          "Inviting a member or changing someone's role.",
          "Any record of an email actually being sent. The app stops at Gmail draft created.",
          "Learning from your feedback. Rejecting or editing a draft does not change future ones.",
          "Automatic retention purges. Deletion is always a button someone presses.",
          "Researching a single lead. Campaigns only.",
        ],
      },
      {
        kind: "note",
        text: "Two things worth remembering when in doubt. Nothing is ever sent from this app. And nothing is ever invented: when the app cannot support a claim, it blocks the draft rather than filling the gap.",
      },
    ],
    related: ["getting-started", "how-scoring-works", "why-drafts-get-blocked", "settings-overview"],
  },
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const BY_SLUG = new Map(ARTICLES.map((a) => [a.slug, a]));

export function getArticle(slug: string): Article | null {
  return BY_SLUG.get(slug) ?? null;
}

export function getSection(key: SectionKey): (typeof HELP_SECTIONS)[number] | null {
  return HELP_SECTIONS.find((s) => s.key === key) ?? null;
}

/** Articles in a section, in authored order. */
export function articlesInSection(key: SectionKey): Article[] {
  return ARTICLES.filter((a) => a.section === key);
}

/**
 * The previous and next article within the same section, so a reader can work
 * through a section without going back to the index.
 */
export function sectionNeighbours(slug: string): { prev: Article | null; next: Article | null } {
  const article = getArticle(slug);
  if (!article) return { prev: null, next: null };
  const siblings = articlesInSection(article.section);
  const i = siblings.findIndex((a) => a.slug === slug);
  return {
    prev: i > 0 ? (siblings[i - 1] ?? null) : null,
    next: i >= 0 && i < siblings.length - 1 ? (siblings[i + 1] ?? null) : null,
  };
}

/** A block's searchable text, flattened. */
function blockText(block: Block): string {
  switch (block.kind) {
    case "para":
    case "note":
    case "warning":
    case "heading":
      return block.text;
    case "steps":
    case "bullets":
      return block.items.join(" ");
    case "table":
      return [...block.head, ...block.rows.flat()].join(" ");
    case "terms":
      return block.items.map((t) => `${t.term} ${t.definition}`).join(" ");
  }
}

/**
 * Two lowercased indexes per article. `head` is what the article says it is
 * about (title, summary, keywords) and drives ranking; `full` adds the body and
 * decides whether the article matches at all.
 */
const INDEX = new Map(
  ARTICLES.map((a) => {
    const head = [a.title, a.summary, a.keywords.join(" ")].join(" ").toLowerCase();
    return [a.slug, { head, full: `${head} ${a.blocks.map(blockText).join(" ")}`.toLowerCase() }];
  }),
);

/**
 * Case-insensitive search across the title, summary, keywords and full body of
 * every article. Pure, so the landing page can filter as you type without a
 * round trip, and so it can be tested without rendering anything.
 *
 * Every whitespace-separated word in the query must appear somewhere, which
 * makes a two-word query narrow the results rather than widen them. Articles
 * whose title, summary or keywords match all the terms are listed first, so
 * searching "scoring" leads with the scoring article rather than with whichever
 * article happens to mention the word earliest. Within a tier, authored order.
 */
export function searchArticles(query: string): Article[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return ARTICLES;

  const matches = ARTICLES.filter((a) => {
    const full = INDEX.get(a.slug)?.full ?? "";
    return terms.every((t) => full.includes(t));
  });

  const isAbout = (a: Article) => {
    const head = INDEX.get(a.slug)?.head ?? "";
    return terms.every((t) => head.includes(t));
  };
  return [...matches.filter(isAbout), ...matches.filter((a) => !isAbout(a))];
}

/** Stable, URL-safe id for a heading, so the on-page contents can link to it. */
export function headingId(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}
