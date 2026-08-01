# Build an AI Healthcare Outreach Agent

You are a senior full-stack engineer, AI systems architect, and product designer. Build a production-ready AI outreach platform that identifies healthcare clinics, evaluates their business needs, creates personalized outreach drafts, and organizes leads in a sales dashboard.

Do not build a basic scraper or generic email generator. Build a reliable lead-research and outreach workflow with transparent scoring, evidence-based personalization, duplicate prevention, human approval, and clear audit trails.

## Business Context

Our company provides three main services to healthcare clinics:

### 1. Website Design and Development

We design modern websites specifically for healthcare clinics.

The agent should identify clinics with websites that appear outdated, confusing, slow, poorly designed, difficult to use on mobile, or ineffective at converting visitors into patients.

Outreach should direct suitable clinics to our portfolio:

- Company name: [COMPANY NAME]
- Portfolio URL: [PORTFOLIO URL]
- Contact or booking URL: [CONTACT URL]

Our portfolio contains examples of healthcare websites we have designed.

### 2. Custom Software Solutions

We build custom software for healthcare businesses, including:

- Administrative dashboards
- Patient intake systems
- Referral management
- Scheduling tools
- Internal workflow automation
- Multi-location reporting
- Call tracking
- Document and form management
- Performance dashboards
- Custom integrations

The agent should identify operational problems that custom software might solve. It must not invent problems. Recommendations must be based on evidence found on the clinic’s website or other publicly available business information.

### 3. KlearQ Phone Management System

KlearQ is a phone queue and call-management system designed for healthcare clinics.

Potential capabilities include:

- Centralized call queues
- Missed-call tracking
- Callback lists
- Caller identification
- Call routing by clinic or location
- Outbound-call logging
- Staff performance visibility
- Call-volume analytics
- Multi-location phone management
- Reducing missed patient calls
- Improving callback accountability

The agent should recommend KlearQ when there is reasonable evidence that a clinic may experience significant phone-management complexity.

Relevant signals may include:

- Multiple clinic locations
- Several phone numbers
- “Call to book” as the main appointment method
- No online booking
- High-volume services
- Long or complex contact instructions
- Multiple departments
- Several providers
- Centralized reception
- Complaints or reviews mentioning unanswered calls, long hold times, or poor callbacks
- Different operating hours across locations

Do not claim that a clinic is losing calls or revenue unless reliable evidence supports that claim. Instead, use careful wording such as:

“Your multi-location setup may make call routing and callback visibility more difficult.”

## Primary Objective

Create a system that can:

1. Discover healthcare clinics.
2. Collect publicly available business information.
3. Visit and evaluate each clinic’s website.
4. Determine which of our services may be relevant.
5. Score and prioritize leads.
6. Generate a personalized email draft.
7. Save the draft for human review.
8. Display all leads and research in a dashboard.
9. Track outreach status, responses, notes, and follow-up actions.

The system must not automatically send outreach emails in the initial version. It should create drafts that a human can review, edit, approve, and send.

## Target Businesses

Include healthcare clinics such as:

- Physiotherapy clinics
- Chiropractic clinics
- Pain clinics
- Optometry clinics
- Ophthalmology clinics
- Dental clinics
- Orthodontic clinics
- Medical clinics
- Walk-in clinics
- Family medicine clinics
- Sports medicine clinics
- Rehabilitation clinics
- Massage therapy clinics
- Psychology and counselling clinics
- Dermatology clinics
- ENT clinics
- Audiology clinics
- Podiatry clinics
- Addiction treatment clinics
- Fertility clinics
- Cosmetic and medical aesthetic clinics
- Other legitimate outpatient healthcare practices

Allow users to configure:

- Clinic categories
- City
- Province or state
- Country
- Search radius
- Minimum number of locations
- Maximum number of leads
- Required or excluded keywords

## Data Collection

Collect only publicly available business information.

For each clinic, attempt to collect:

- Clinic name
- Clinic category
- Website URL
- Main phone number
- Public business email
- Contact-page URL
- Publicly listed owner, director, clinic manager, or administrator
- Contact person’s job title
- Number of locations
- Location addresses
- Services offered
- Booking method
- Online-booking URL
- Social-media links
- Business hours
- Website technology, when reasonably detectable
- Source URLs
- Date the information was collected

Prioritize official clinic websites and legitimate business directories.

Use compliant APIs where appropriate. Do not bypass authentication, CAPTCHAs, access restrictions, rate limits, robots.txt rules, or website terms. Do not scrape private profiles, gated platforms, or personal information that is not publicly presented for business contact.

Do not collect patient information, health information, or other sensitive personal data.

## Website Evaluation

Create a structured website-audit system.

Evaluate indicators such as:

### Design and Usability

- Outdated visual appearance
- Poor mobile layout
- Difficult navigation
- Inconsistent branding
- Excessive or unreadable text
- Weak visual hierarchy
- Low-quality images
- Missing calls to action
- Poor contact-page experience
- Confusing appointment process

### Technical Quality

- Slow page performance
- Broken links
- Missing HTTPS
- Missing metadata
- Layout problems
- Console errors, when safely detectable
- Missing mobile responsiveness
- Poor accessibility indicators
- Missing form validation
- Contact forms that do not appear functional

### Conversion Quality

- No clear booking button
- No clear phone call-to-action
- Booking requires multiple confusing steps
- No service-specific landing pages
- No location-specific pages
- No provider information
- No trust indicators
- No reviews or testimonials
- No clear explanation of services
- No obvious next step for a prospective patient

Every observation must include:

- The finding
- The supporting evidence
- The source URL
- The date checked
- A confidence level

Avoid subjective insults such as “your website is bad.” Use neutral observations such as:

“The primary appointment action is difficult to locate on mobile.”

## Lead Scoring

Create a configurable lead score from 0 to 100.

Suggested categories:

- Website opportunity: 0–30
- Custom software opportunity: 0–25
- KlearQ opportunity: 0–25
- Contactability: 0–10
- Business fit: 0–10

Store a score breakdown so users can understand why a lead received its score.

Example scoring signals:

### Website Opportunity

- Poor mobile usability
- No clear booking action
- Broken pages
- Outdated design
- Weak calls to action
- Missing location information
- Poor site performance

### Custom Software Opportunity

- Multiple locations
- Complex forms or referral workflows
- Several departments
- Manual intake documents
- Repetitive administrative processes
- Multiple disconnected booking systems
- Complex service navigation

### KlearQ Opportunity

- Multiple clinic locations
- Several phone numbers
- Call-first booking process
- No online booking
- Public complaints about phone response
- Centralized reception
- Multiple departments or providers

### Contactability

- Public decision-maker email
- General business email
- Functional contact form
- Clearly listed clinic manager
- Verified website and phone number

### Business Fit

- Healthcare clinic
- Appropriate geography
- Active business
- Reasonable clinic size
- Services aligned with our portfolio

Allow users to adjust scoring weights in the settings.

## Evidence and Confidence Rules

The agent must distinguish between:

- Verified facts
- Strong inferences
- Weak inferences
- Unknown information

Never present an inference as a confirmed fact.

Every lead recommendation should show:

- Why the clinic may be a good prospect
- Which service is the strongest fit
- The evidence supporting the recommendation
- Any uncertainties
- The URLs where the evidence was found

## Email Draft Generation

Generate concise, personalized outreach emails.

Each draft should:

- Use the clinic’s correct name
- Address a public decision-maker when available
- Mention one or two real observations
- Avoid exaggerated claims
- Focus on a specific business outcome
- Introduce only the most relevant service first
- Include the portfolio link when pitching website work
- Include a simple call to action
- Sound natural and professional
- Avoid generic AI phrasing
- Avoid em dashes
- Avoid excessive compliments
- Avoid pretending to be a patient
- Avoid false familiarity
- Avoid manipulative urgency
- Avoid mentioning that the clinic was scraped

Create separate email strategies for:

1. Website redesign
2. Custom software
3. KlearQ
4. Combined opportunity

Do not force all three services into every email. Choose the strongest opportunity.

The default email should be approximately 80 to 150 words.

Example structure:

- Personalized opening
- Specific observation
- Relevant service and benefit
- Portfolio or product reference
- Low-pressure call to action
- Professional signature

Include:

- Subject line
- Recipient name
- Recipient email
- Draft body
- Service being pitched
- Personalization evidence
- Confidence score
- Required human-review warnings

Do not automatically send the email.

## Dashboard

Build a clean, professional dashboard using:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- PostgreSQL
- Prisma
- Vercel-compatible architecture

Use a minimal, premium interface. Avoid excessive rounded cards, unnecessary gradients, oversized empty spaces, and decorative animations.

### Main Dashboard

Show:

- Total leads
- New leads
- High-priority leads
- Drafts awaiting review
- Contacted leads
- Responses
- Follow-ups due
- Leads by clinic category
- Leads by location
- Leads by recommended service
- Lead-score distribution

### Lead Table

Include columns for:

- Clinic
- Category
- Location
- Website score
- Software score
- KlearQ score
- Overall score
- Recommended service
- Contact status
- Draft status
- Last researched
- Follow-up date

Include:

- Search
- Filtering
- Sorting
- Pagination
- Bulk selection
- Duplicate detection
- Saved views
- CSV export

### Lead Detail Page

Display:

- Clinic overview
- Contact information
- Locations
- Services
- Website screenshots or preview
- Website-audit findings
- Supporting evidence
- Score breakdown
- Recommended pitch
- Generated email draft
- Editable notes
- Activity timeline
- Source URLs
- Research date
- Confidence indicators

### Pipeline Stages

Use configurable stages such as:

- Discovered
- Researching
- Qualified
- Draft ready
- Needs review
- Approved
- Contacted
- Replied
- Meeting booked
- Not interested
- Follow up later
- Disqualified

## Human Approval Workflow

The user must be able to:

1. Review the collected information.
2. Inspect the supporting evidence.
3. Edit the email.
4. Approve or reject the draft.
5. Copy the email.
6. Create a Gmail draft through an approved integration.
7. Mark the lead as contacted.
8. Schedule a follow-up.
9. Record a reply or meeting.
10. Add internal notes.

Any future email-sending feature must require explicit user approval and include configurable daily limits, suppression lists, unsubscribe handling, and audit logs.

## Integrations

Design the architecture to support:

- Gmail draft creation
- Google Calendar
- CRM export
- CSV import and export
- Search or business-directory APIs
- Website performance APIs
- Email verification providers

Store API credentials securely in environment variables.

Do not hardcode secrets.

## Database Entities

Create suitable models for:

- User
- Organization
- Search campaign
- Clinic
- Clinic location
- Contact
- Website audit
- Audit finding
- Lead score
- Source
- Email draft
- Outreach activity
- Follow-up task
- Suppression-list entry
- System setting
- Scraping or research job
- Error log

Include timestamps and provenance fields.

## Research Job System

Build research as a background job workflow with:

- Job status
- Progress
- Retry handling
- Rate limiting
- Error reporting
- Source tracking
- Duplicate prevention
- Partial-result saving
- Cancellation
- Resume capability

Do not allow one failed website to stop an entire campaign.

## Compliance and Safety

The system must be designed to comply with applicable privacy, anti-spam, data-protection, and electronic-communications laws.

Implement:

- Human approval before outreach
- Business-purpose contact data only
- Source attribution
- Data-retention controls
- Suppression lists
- Unsubscribe tracking
- Do-not-contact status
- Audit logs
- Configurable outreach limits
- Clear sender identification
- No misleading identities
- No automatic contact-form spam
- No bypassing website protections
- No scraping patient or sensitive health data

The application should clearly warn users that they are responsible for ensuring each outreach campaign complies with the laws and regulations applying to the sender and recipient.

## Development Process

Work in phases.

### Phase 1: Planning

Before writing code:

1. Inspect the existing repository.
2. Summarize the current architecture.
3. Create a detailed implementation plan in `plan.md`.
4. Identify missing environment variables and integrations.
5. Propose the database schema.
6. List any assumptions.
7. Create a prioritized task checklist.

Do not begin major implementation until the plan is internally consistent.

### Phase 2: Core Platform

Build:

- Authentication
- Database schema
- Dashboard shell
- Clinic and contact records
- Lead pipeline
- Manual lead entry
- CSV import
- Lead-detail pages

### Phase 3: Research Engine

Build:

- Configurable clinic search
- Public website collection
- Website analysis
- Source storage
- Duplicate detection
- Evidence and confidence system
- Lead scoring

### Phase 4: AI Drafting

Build:

- Service recommendation logic
- Prompt templates
- Email-draft generation
- Draft editing
- Approval workflow
- Hallucination checks
- Evidence-linked personalization

### Phase 5: Integrations

Build:

- Gmail draft integration
- Calendar follow-up actions
- CSV export
- Optional third-party APIs

### Phase 6: Testing

Test:

- Authentication
- Permission boundaries
- Duplicate handling
- Failed scraping jobs
- Rate limiting
- Lead scoring
- Email accuracy
- Evidence linking
- Draft approval
- Mobile responsiveness
- Accessibility
- Empty states
- Loading states
- Error states

## Acceptance Criteria

The first production-ready version is complete when a user can:

1. Create a healthcare clinic search campaign.
2. Select clinic categories and geographic areas.
3. Discover legitimate clinic businesses.
4. Collect public business information.
5. Analyze clinic websites.
6. View evidence for every major finding.
7. Receive a transparent lead score.
8. See whether website work, custom software, or KlearQ is the strongest fit.
9. Review a personalized email draft.
10. Edit and approve the draft.
11. Create a Gmail draft or copy the email.
12. Track the lead through a sales pipeline.
13. Schedule and manage follow-ups.
14. Export the lead data.
15. Prevent duplicates and respect do-not-contact records.

## Final Instructions

Start by inspecting the repository and creating `plan.md`.

Do not create placeholder functionality that appears operational but is not connected to real logic.

Do not fabricate clinic information, contacts, website findings, or personalization.

Use modular services so that data providers, AI models, email providers, and research methods can be replaced later.

Prioritize reliability, evidence, human oversight, and maintainability over maximum scraping volume.
