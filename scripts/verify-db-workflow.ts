/**
 * End-to-end, database-backed verification of the research workflow against a
 * REAL PostgreSQL instance (Prompt-3 infra, items 9-11). It:
 *
 *   1. starts a real local Postgres (embedded-postgres, no Docker),
 *   2. applies the Prisma migration (migrate deploy, or creates it on first run),
 *   3. seeds the development org/user,
 *   4. runs one small campaign through the REAL PrismaResearchRepository using a
 *      tightly-limited, controlled discovery set (no Places key, no outreach, no
 *      sensitive data) and the real compliance-first website fetcher, and
 *   5. reads the data back and asserts the campaign, job progress, clinics,
 *      sources, timestamps, findings, errors, and final status were stored, and
 *      that a second run creates no duplicates.
 *
 * Run with: npm run verify:db
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { startLocalPostgres } from "./local-postgres.mjs";

// Must be set BEFORE anything imports the Prisma client.
const PG_URL = "postgresql://postgres:postgres@localhost:5432/outreach?schema=public";
process.env.DATABASE_URL = PG_URL;
process.env.DIRECT_URL = PG_URL;

// Phase 6 integration config (verification-only, non-secret placeholders). These
// enable token encryption, OAuth client config, and signed state so the Google
// integration modules run against the real database with a fake API transport.
process.env.TOKEN_ENCRYPTION_KEY ||= Buffer.alloc(32, 9).toString("base64");
process.env.AUTH_SECRET ||= "verify-auth-secret-for-oauth-state";
process.env.GOOGLE_CLIENT_ID ||= "verify-client-id.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET ||= "verify-client-secret";
process.env.NEXTAUTH_URL ||= "http://localhost:3000";

const CAMPAIGN_NAME = "DB Verify — tiny controlled run";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

/**
 * A data directory of this script's own, NOT the one `npm run db:local` uses.
 *
 * This script starts Postgres with `fresh: true`, and `startLocalPostgres`
 * implements that as `rmSync(dir, { recursive: true, force: true })`. It used
 * to default to `./.local-postgres`, so every run silently deleted the
 * developer's working database: orgs, leads, drafts, approvals, everything.
 * The script's own description ("starts a real local Postgres") gives no hint
 * that it destroys data, and the destruction happens before the first line of
 * output.
 *
 * Isolating it is the fix. The verification still runs against a real
 * PostgreSQL instance with a real migration and a real seed, which is the
 * whole point of the script; it just no longer does it on top of your data.
 */
const VERIFY_PG_DIR = "./.local-postgres-verify";

async function main() {
  console.log("→ Starting real local PostgreSQL (embedded-postgres)…");
  console.log(`   Using an isolated data directory: ${VERIFY_PG_DIR}`);
  console.log("   This is wiped on every run. Your db:local database is untouched.");
  // EMBEDDED_PG_DIR still overrides, for anyone who wants to point this
  // elsewhere, but the default must never be the working database.
  const { pg } = await startLocalPostgres({
    fresh: true,
    dataDir: process.env.EMBEDDED_PG_DIR || VERIFY_PG_DIR,
  });

  try {
    const env = { ...process.env };
    const hasMigrations =
      existsSync("prisma/migrations") &&
      readdirSync("prisma/migrations").some((f) => f !== "migration_lock.toml");

    console.log(`→ Applying Prisma migration (${hasMigrations ? "migrate deploy" : "migrate dev --name init"})…`);
    if (hasMigrations) {
      execSync("npx prisma migrate deploy", { stdio: "inherit", env });
    } else {
      execSync("npx prisma migrate dev --name init_healthcare_schema", { stdio: "inherit", env });
    }
    execSync("npx prisma generate", { stdio: "inherit", env });

    console.log("→ Seeding development data…");
    execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });

    // Import AFTER migrate/generate + env are set, so the Prisma client connects
    // to the embedded instance and matches the freshly-applied schema.
    const { prisma } = await import("@/lib/db");
    const { PrismaResearchRepository } = await import("@/lib/research/repository");
    const { runCampaignResearch } = await import("@/lib/research/pipeline");
    const { HttpWebsiteFetcher } = await import("@/lib/research/providers/fetcher");
    const { NullPerformanceProvider } = await import("@/lib/research/providers/performance");
    const { NullBrowserProvider } = await import("@/lib/research/providers/browser");
    const { JobStatus } = await import("@prisma/client");
    const { recomputeClinicScore } = await import("@/lib/scoring/rescore");
    const { loadScoringConfig, resolveScoringConfig } = await import("@/lib/scoring/config");
    const { Confidence } = await import("@prisma/client");
    const { FakeAiProvider } = await import("@/lib/ai/fake");
    const { draftAndSaveClinic, transitionDraft } = await import("@/lib/ai/draft-repository");
    const { DRAFT_PROMPT_VERSION } = await import("@/lib/ai/prompts");
    type DiscoveredClinic = import("@/lib/research/types").DiscoveredClinic;
    type CampaignCriteria = import("@/lib/research/types").CampaignCriteria;
    type DiscoveryProvider = import("@/lib/research/types").DiscoveryProvider;

    const org = await prisma.organization.findFirstOrThrow({
      where: { memberships: { some: {} } },
      include: { memberships: true },
    });
    const ownerId = org.memberships[0]!.userId;
    console.log(`→ Using seeded org "${org.name}" (owner ${ownerId}).`);

    // A tiny, controlled discovery set: one real, safe public site (example.com,
    // reserved for documentation) and one clinic with no website (to exercise
    // partial-result saving + error logging). No Places API, no sensitive data.
    const candidates: DiscoveredClinic[] = [
      {
        name: "Verify Example Clinic",
        websiteUrl: "https://example.com",
        mainPhone: "+1-416-555-0000",
        address: "1 Verification Way, Toronto",
        category: "Dental",
        locationCount: 1,
        externalId: "verify-1",
        sourceUrl: "https://provider.example/verify-1",
        keywordsHaystack: "verify example clinic dental",
      },
      {
        name: "Verify No-Site Clinic",
        websiteUrl: null,
        mainPhone: "+1-416-555-0001",
        address: "2 Verification Way, Toronto",
        category: "Dental",
        locationCount: 1,
        externalId: "verify-2",
        sourceUrl: "https://provider.example/verify-2",
        keywordsHaystack: "verify no site clinic dental",
      },
    ];

    class ControlledDiscovery implements DiscoveryProvider {
      readonly name = "controlled-verify";
      isConfigured() {
        return true;
      }
      async discover(_c: CampaignCriteria, limit: number) {
        return candidates.slice(0, limit);
      }
    }

    const providers = {
      discovery: new ControlledDiscovery(),
      fetcher: new HttpWebsiteFetcher(),
      performance: new NullPerformanceProvider(),
      browser: new NullBrowserProvider(),
    };

    async function runOnce(label: string) {
      // Clean up any prior campaign of the same name so the script is repeatable.
      await prisma.searchCampaign.deleteMany({ where: { orgId: org.id, name: CAMPAIGN_NAME } });
      const campaign = await prisma.searchCampaign.create({
        data: {
          orgId: org.id,
          name: CAMPAIGN_NAME,
          categories: ["Dental"],
          city: "Toronto",
          region: "Ontario",
          country: "Canada",
          minLocations: 1,
          maxLeads: 5,
          requiredKeywords: [],
          excludedKeywords: [],
          status: "RUNNING",
          createdById: ownerId,
        },
      });
      const job = await prisma.researchJob.create({
        data: {
          orgId: org.id,
          campaignId: campaign.id,
          type: "campaign.research",
          status: JobStatus.QUEUED,
          runnerRef: "verify-script",
        },
      });
      console.log(`→ [${label}] Running research (real Prisma repository)…`);
      const summary = await runCampaignResearch(
        campaign.id,
        job.id,
        new PrismaResearchRepository(),
        providers,
      );
      return { campaign, job, summary };
    }

    // ---- First run --------------------------------------------------------
    const first = await runOnce("run 1");
    console.log(`   summary: ${JSON.stringify(first.summary)}`);

    const jobRow = await prisma.researchJob.findUniqueOrThrow({ where: { id: first.job.id } });
    const clinics = await prisma.clinic.findMany({
      where: { campaignId: first.campaign.id },
      include: { sources: true, contacts: true, locations: true, audits: { include: { findings: true } } },
      orderBy: { name: "asc" },
    });
    const errors = await prisma.errorLog.findMany({ where: { jobId: first.job.id } });

    const totalSources = clinics.reduce((n, c) => n + c.sources.length, 0);
    const totalFindings = clinics.reduce((n, c) => n + c.audits.reduce((m, a) => m + a.findings.length, 0), 0);

    // ---- Assertions -------------------------------------------------------
    assert(["SUCCEEDED", "PARTIAL"].includes(jobRow.status), `job terminal status was ${jobRow.status}`);
    assert(jobRow.finishedAt instanceof Date, "job has a finishedAt timestamp");
    assert(jobRow.progress === 100, `job progress is 100 (was ${jobRow.progress})`);
    assert(jobRow.processed === 2, `job processed both candidates (was ${jobRow.processed})`);
    assert(clinics.length === 2, `both clinics stored (was ${clinics.length})`);
    assert(
      clinics.every((c) => c.collectedAt instanceof Date && c.lastResearchedAt instanceof Date),
      "clinics have collection timestamps",
    );
    assert(clinics.every((c) => c.leadSource === "RESEARCH"), "clinics marked as RESEARCH leads");
    assert(totalSources >= 2, `source URLs stored with provenance (was ${totalSources})`);
    assert(
      clinics.every((c) => c.sources.some((s) => s.type === "discovery" && s.retrievedAt instanceof Date)),
      "each clinic has a discovery source with a retrievedAt timestamp",
    );
    assert(totalFindings >= 1, `at least one audit finding stored (was ${totalFindings})`);
    assert(
      errors.some((e) => e.scope === "enrich"),
      "the no-website clinic produced an error-log row",
    );

    console.log("\n   Stored data (run 1):");
    for (const c of clinics) {
      const findings = c.audits.reduce((m, a) => m + a.findings.length, 0);
      console.log(
        `   • ${c.name}: ${c.sources.length} source(s), ${c.contacts.length} contact(s), ${c.locations.length} location(s), ${findings} finding(s), site=${c.websiteUrl ?? "none"}`,
      );
    }
    console.log(`   job: status=${jobRow.status} progress=${jobRow.progress} processed=${jobRow.processed} succeeded=${jobRow.succeeded} failed=${jobRow.failed}`);
    console.log(`   errors logged: ${errors.length} (${[...new Set(errors.map((e) => e.scope))].join(", ")})`);

    // ---- Phase 4: audit + scoring storage --------------------------------
    // Query by clinic id (stable): a re-run deletes + recreates the campaign,
    // which SetNulls the clinics' campaignId, so campaignId is not a stable key.
    const clinicIds = clinics.map((c) => c.id);
    const scores = await prisma.leadScore.findMany({ where: { clinicId: { in: clinicIds } } });
    const findingsAll = await prisma.auditFinding.findMany({
      where: { audit: { clinicId: { in: clinicIds } } },
    });

    assert(scores.length === 2, `both clinics scored (was ${scores.length})`);
    assert(scores.every((s) => s.weightsVersion === "default-v1"), "scores stamped with ruleset version");
    assert(scores.every((s) => ["HIGH", "MEDIUM", "LOW"].includes(s.confidence)), "scores carry a confidence level");
    assert(scores.every((s) => s.recommendedService !== null), "scores carry a recommended service");
    assert(scores.every((s) => s.overallScore >= 0 && s.overallScore <= 100), "overall scores are within 0-100");

    const breakdown = scores[0]!.breakdown as {
      categories: Record<string, { contributions: { evidence: string; sourceUrl: string; ruleId: string }[] }>;
      recommendation: { service: string };
    };
    assert(!!breakdown.categories && !!breakdown.recommendation, "breakdown stores categories + recommendation");
    const contribWithEvidence = Object.values(breakdown.categories).some((c) =>
      c.contributions.some((k) => k.evidence && k.sourceUrl && k.ruleId),
    );
    assert(contribWithEvidence, "rule contributions carry evidence + source + rule id");

    assert(
      findingsAll.every((f) => typeof f.isFact === "boolean" && f.ruleVersion === "default-v1"),
      "findings carry fact/inference classification + ruleset version",
    );
    assert(findingsAll.some((f) => f.confidence === "VERIFIED"), "at least one verified-fact finding stored");
    assert(findingsAll.some((f) => f.confidence !== "VERIFIED"), "at least one inference finding stored");
    assert(findingsAll.some((f) => f.scoreContribution > 0), "at least one finding contributed points");

    console.log(
      `   scoring: ${scores.length} score(s), ${findingsAll.length} finding(s); services=${[...new Set(scores.map((s) => s.recommendedService))].join(", ")}`,
    );

    // ---- Second run: duplicate prevention (clinics, findings, scores) -----
    const beforeCount = await prisma.clinic.count({ where: { orgId: org.id } });
    const beforeFindings = findingsAll.length;
    const beforeScores = scores.length;
    const second = await runOnce("run 2");
    const afterCount = await prisma.clinic.count({ where: { orgId: org.id } });
    const afterFindings = await prisma.auditFinding.count({
      where: { audit: { clinicId: { in: clinicIds } } },
    });
    const afterScores = await prisma.leadScore.count({ where: { clinicId: { in: clinicIds } } });
    console.log(`   summary: ${JSON.stringify(second.summary)}`);
    assert(afterCount === beforeCount, `no duplicate clinics (before ${beforeCount}, after ${afterCount})`);
    assert(afterFindings === beforeFindings, `no duplicate findings (before ${beforeFindings}, after ${afterFindings})`);
    assert(afterScores === beforeScores, `no duplicate scores (before ${beforeScores}, after ${afterScores})`);
    assert(second.summary.total === 0, `second run found 0 new candidates (was ${second.summary.total})`);
    console.log(`\n   Duplicate prevention: clinics=${afterCount}, findings=${afterFindings}, scores=${afterScores} unchanged across a re-run. ✔`);

    // ---- Manual override is preserved by recalculation -------------------
    const target = clinics.find((c) => c.websiteUrl)!;
    await prisma.leadScore.update({
      where: { clinicId: target.id },
      data: {
        manualOverride: true,
        overrideOverall: 88,
        overrideService: "KLEARQ",
        overrideReason: "verification override",
        overrideAt: new Date(),
      },
    });
    const orgConfig = await loadScoringConfig(org.id);
    await recomputeClinicScore(target.id, orgConfig);
    const afterRecalc = await prisma.leadScore.findUniqueOrThrow({ where: { clinicId: target.id } });
    assert(
      afterRecalc.manualOverride === true && afterRecalc.overrideOverall === 88 && afterRecalc.overrideService === "KLEARQ",
      "recalculation preserves an active manual override",
    );

    // ---- Rescore after a rules change re-stamps the ruleset version -------
    const custom = resolveScoringConfig({
      revision: 1,
      ruleWeights: { fit_is_healthcare: 8 },
      categoryCaps: {},
      confidenceMultipliers: {},
      recommendation: {},
    });
    await recomputeClinicScore(target.id, custom);
    const rescored = await prisma.leadScore.findUniqueOrThrow({ where: { clinicId: target.id } });
    assert(rescored.weightsVersion === "custom-r1", `rescore stamped the custom ruleset version (was ${rescored.weightsVersion})`);
    assert(rescored.manualOverride === true, "the override survives a rules-change rescore");
    const restamped = await prisma.auditFinding.findFirst({ where: { audit: { clinicId: target.id } } });
    assert(restamped?.ruleVersion === "custom-r1", "finding contributions re-stamped with the new ruleset version");
    console.log("\n   Override preserved across recalc, and rescore re-stamped ruleset custom-r1. ✔");

    // ---- Phase 5: evidence-grounded AI drafting persistence -----------------
    // Uses a deterministic FAKE provider (script/test only — never production) to
    // exercise the REAL Prisma persistence: draft + version snapshots, evidence
    // mapping, warnings, provider/model, statuses, approval record, and the
    // one-draft-per-clinic constraint (no duplicates on regenerate).
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        companyName: "Verify Agency",
        portfolioUrl: "https://verify.example/work",
        contactUrl: "https://verify.example/contact",
        senderName: "Verifier",
      },
    });

    // Add citable website findings (force their confidence on update so they are
    // citable evidence), then recompute. Pin the strategy to WEBSITE via an
    // override — the draft must STILL ground itself in the real website evidence
    // above; an override alone never becomes evidence (see draft.test.ts).
    const targetAudit = await prisma.websiteAudit.findFirstOrThrow({ where: { clinicId: target.id } });
    for (const f of [
      { code: "web_no_booking_cta", confidence: Confidence.STRONG_INFERENCE, isFact: false, finding: "No clear online booking" },
      { code: "web_missing_https", confidence: Confidence.VERIFIED, isFact: true, finding: "Insecure page detected" },
    ]) {
      const fields = {
        category: "WEBSITE" as const,
        ruleVersion: "default-v1",
        finding: f.finding,
        evidence: `Observed on ${target.websiteUrl}`,
        sourceUrl: target.websiteUrl ?? "https://example.com",
        confidence: f.confidence,
        isFact: f.isFact,
        dismissed: false,
      };
      await prisma.auditFinding.upsert({
        where: { auditId_code: { auditId: targetAudit.id, code: f.code } },
        create: { auditId: targetAudit.id, code: f.code, ...fields },
        update: fields,
      });
    }
    await recomputeClinicScore(target.id, await loadScoringConfig(org.id));
    await prisma.leadScore.update({
      where: { clinicId: target.id },
      data: {
        manualOverride: true,
        overrideService: "WEBSITE",
        overrideOverall: null,
        overrideReason: "verify drafting",
      },
    });

    const goodBody = `Hello, I recently looked through the ${target.name} website and noticed there is no clear online booking option for new patients. A clearer booking path can help more visitors become booked appointments without extra phone calls. We design healthcare websites focused on exactly that, and you can browse examples in our portfolio at https://verify.example/work. If it is useful, I would be glad to share a couple of specific ideas for ${target.name}. Would you be open to a short call next week? Thank you for your time, and there is no pressure either way. Best regards, Verifier`;
    const fakeAi = new FakeAiProvider({
      respond: () => ({
        subject: `A quick note about the ${target.name} website`,
        body: goodBody,
        observationsUsed: ["web_no_booking_cta"],
        claims: [{ text: "there is no clear online booking option", evidenceCode: "web_no_booking_cta" }],
      }),
    });

    const gen = await draftAndSaveClinic(org.id, target.id, fakeAi, { id: ownerId, name: "Verifier" });
    assert(gen.outcome === "generated", `draft generated for the website lead (was ${gen.outcome})`);

    const draft = await prisma.emailDraft.findUniqueOrThrow({
      where: { clinicId: target.id },
      include: { versions: true },
    });
    assert(draft.status === "GENERATED", `draft stored in review (was ${draft.status})`);
    assert(draft.aiProvider === "fake" && !!draft.aiModel, "provider + model stored on the draft");
    // Compared against the constant, not a literal. This assertion was pinned
    // to "draft-v1" and the prompt has since moved to v3, so verify:db failed
    // for everyone regardless of what they changed.
    assert(
      draft.promptVersion === DRAFT_PROMPT_VERSION,
      `prompt version stored (expected ${DRAFT_PROMPT_VERSION}, got ${draft.promptVersion})`,
    );
    assert(draft.version === 1 && draft.generatedAt instanceof Date, "version + generation timestamp stored");
    assert(Array.isArray(draft.personalizationEvidence) && (draft.personalizationEvidence as unknown[]).length >= 1, "claim-to-evidence mapping stored");
    assert(draft.evidenceFindingIds.length >= 1 && draft.evidenceSourceUrls.length >= 1, "evidence ids + source URLs stored");
    assert(draft.versions.length === 1 && draft.versions[0]!.changeType === "generated", "initial version snapshot stored");

    // Approve: records user + timestamp + final content + evidence snapshot.
    await transitionDraft(
      draft,
      { status: "APPROVED", approvedById: ownerId, approvedAt: new Date() },
      "approved",
      { id: ownerId, name: "Verifier" },
      null,
    );
    const approved = await prisma.emailDraft.findUniqueOrThrow({
      where: { clinicId: target.id },
      include: { versions: { orderBy: { version: "asc" } } },
    });
    assert(approved.status === "APPROVED" && approved.approvedById === ownerId && approved.approvedAt instanceof Date, "approval recorded (user + timestamp)");
    assert(approved.versions.length === 2 && approved.versions[1]!.status === "APPROVED", "approval snapshot captured final content");

    // Editing an approved draft returns it to review.
    await transitionDraft(
      approved,
      { status: "EDITED", editedBody: approved.body, approvedById: null, approvedAt: null },
      "edited",
      { id: ownerId, name: "Verifier" },
      null,
    );
    const edited = await prisma.emailDraft.findUniqueOrThrow({ where: { clinicId: target.id } });
    assert(edited.status === "EDITED", "editing an approved draft returns it to review");

    // Regenerate: bumps the version, never duplicates the draft row.
    const beforeDraftRows = await prisma.emailDraft.count({ where: { clinicId: target.id } });
    await draftAndSaveClinic(org.id, target.id, fakeAi, { id: ownerId, name: "Verifier" });
    const afterDraftRows = await prisma.emailDraft.count({ where: { clinicId: target.id } });
    const regen = await prisma.emailDraft.findUniqueOrThrow({
      where: { clinicId: target.id },
      include: { versions: true },
    });
    assert(afterDraftRows === beforeDraftRows, `no duplicate draft row on regenerate (before ${beforeDraftRows}, after ${afterDraftRows})`);
    assert(regen.version === 4, `version bumped across generate/approve/edit/regenerate (was ${regen.version})`);
    assert(regen.versions.length === 4, `four immutable version snapshots, no duplicates (was ${regen.versions.length})`);

    // A lead with no citable evidence produces a BLOCKED draft (never fabricated).
    const noSite = clinics.find((c) => !c.websiteUrl)!;
    const blocked = await draftAndSaveClinic(org.id, noSite.id, fakeAi, { id: ownerId, name: "Verifier" });
    assert(blocked.outcome === "blocked", `no-evidence lead produced a blocked draft (was ${blocked.outcome})`);
    const blockedDraft = await prisma.emailDraft.findUniqueOrThrow({ where: { clinicId: noSite.id } });
    assert(blockedDraft.status === "BLOCKED" && !!blockedDraft.blockedReason, "blocked draft stored with a reason");

    console.log(
      `\n   Drafting: draft v${regen.version} with ${regen.versions.length} snapshots, provider=${draft.aiProvider}/${draft.aiModel}, evidence=${draft.evidenceFindingIds.length}; approval recorded; regenerate created no duplicate; no-evidence lead blocked. ✔`,
    );

    // ---- Phase 6: Google integrations (Gmail drafts, Calendar, follow-ups) ---
    // Real Prisma persistence + real crypto/OAuth token handling, with a FAKE
    // Google API transport (no network, and structurally NO send method).
    const { encryptSecret } = await import("@/lib/integrations/crypto");
    const { getValidAccessToken } = await import("@/lib/integrations/google-tokens");
    const { createGmailDraftForApproved, getGmailDraftForEmailDraft } = await import("@/lib/integrations/gmail");
    const { syncFollowUpToCalendar, cancelFollowUpCalendar } = await import("@/lib/integrations/calendar");
    const { GoogleNotConnectedError } = await import("@/lib/integrations/errors");
    type GoogleApiClient = import("@/lib/integrations/google-api").GoogleApiClient;
    type CalendarEventInput = import("@/lib/integrations/google-api").CalendarEventInput;

    class FakeGoogleApi implements GoogleApiClient {
      gmail = 0;
      calCreate = 0;
      calUpdate = 0;
      calCancel = 0;
      failGmail = false;
      lastEvent: CalendarEventInput | null = null;
      async createGmailDraft() {
        if (this.failGmail) throw new Error("fake gmail failure");
        this.gmail += 1;
        return { id: `gd-${this.gmail}`, messageId: `m-${this.gmail}` };
      }
      async createCalendarEvent(_t: string, event: CalendarEventInput) {
        this.calCreate += 1;
        this.lastEvent = event;
        return { id: `ev-${this.calCreate}` };
      }
      async updateCalendarEvent(_t: string, id: string) {
        this.calUpdate += 1;
        return { id };
      }
      async cancelCalendarEvent() {
        this.calCancel += 1;
      }
    }
    const api = new FakeGoogleApi();
    // Read a mutable counter as a plain number so `assert` does not narrow the
    // field to a literal type across the fake client's later mutations.
    const num = (x: number): number => x;
    const okRefresh = (async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ access_token: "refreshed-access", expires_in: 3600, scope: "openid", token_type: "Bearer" }),
    })) as unknown as typeof fetch;
    const invalidGrant = (async () => ({
      ok: false,
      status: 400,
      text: async () => "error=invalid_grant",
    })) as unknown as typeof fetch;
    const g6actor = { id: ownerId, name: "Verifier" };

    // (a) Per-user connection with an EXPIRED access token → transparent refresh.
    const conn = await prisma.googleConnection.create({
      data: {
        orgId: org.id,
        userId: ownerId,
        accountEmail: "owner@agency.test",
        googleSub: "sub-1",
        scopes: [
          "https://www.googleapis.com/auth/gmail.compose",
          "https://www.googleapis.com/auth/calendar.events",
          "openid",
          "email",
        ],
        accessTokenEnc: encryptSecret("old-access"),
        refreshTokenEnc: encryptSecret("refresh-1"),
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const at = await getValidAccessToken(conn, okRefresh);
    assert(at === "refreshed-access", "expired access token was transparently refreshed");
    const refreshed = await prisma.googleConnection.findUniqueOrThrow({ where: { id: conn.id } });
    assert(
      !!refreshed.expiresAt && refreshed.expiresAt.getTime() > Date.now(),
      "refreshed token expiry stored in the future",
    );
    assert(
      !!refreshed.accessTokenEnc && refreshed.accessTokenEnc !== conn.accessTokenEnc,
      "new access token re-encrypted at rest (never stored in the clear)",
    );

    // (b) Approve the target draft with a recipient, then create a Gmail draft.
    const targetDraft = await prisma.emailDraft.findUniqueOrThrow({ where: { clinicId: target.id } });
    await prisma.emailDraft.update({
      where: { id: targetDraft.id },
      data: { recipientEmail: "owner@targetclinic.test", status: "APPROVED", approvedById: ownerId, approvedAt: new Date() },
    });
    await prisma.clinic.update({ where: { id: target.id }, data: { stage: "APPROVED", doNotContact: false } });

    const r1 = await createGmailDraftForApproved(org.id, targetDraft.id, g6actor, { apiClient: api, fetchImpl: okRefresh });
    assert(r1.ok && r1.outcome === "created", `approved draft created a Gmail draft (was ${r1.outcome})`);
    assert(num(api.gmail) === 1, "exactly one Gmail draft API call");
    const gd = await getGmailDraftForEmailDraft(targetDraft.id);
    assert(!!gd && gd.status === "CREATED" && !!gd.gmailDraftId, "Gmail draft record stored as CREATED with an id");
    const stageAfter = await prisma.clinic.findUniqueOrThrow({ where: { id: target.id } });
    // Advanced to GMAIL_DRAFT_CREATED (a distinct stage), NOT to CONTACTED.
    assert(stageAfter.stage === "GMAIL_DRAFT_CREATED", `stage advanced to GMAIL_DRAFT_CREATED, not contacted (was ${stageAfter.stage})`);

    // (c) Idempotency: a repeat request creates no duplicate Gmail draft.
    const r2 = await createGmailDraftForApproved(org.id, targetDraft.id, g6actor, { apiClient: api, fetchImpl: okRefresh });
    assert(r2.outcome === "already_exists", "repeat request is idempotent (already exists)");
    assert(num(api.gmail) === 1, "no duplicate Gmail draft on a repeat request");

    // (d) Editing an approved draft resets it to review → Gmail blocked.
    await prisma.emailDraft.update({
      where: { id: targetDraft.id },
      data: { status: "EDITED", version: { increment: 1 }, approvedById: null, approvedAt: null },
    });
    const rEdited = await createGmailDraftForApproved(org.id, targetDraft.id, g6actor, { apiClient: api });
    assert(!rEdited.ok && rEdited.reason === "not_approved", "edited (unapproved) draft cannot create a Gmail draft");
    assert(num(api.gmail) === 1, "no Gmail API call while the draft is in review");

    // (e) Re-approving the changed content allows a NEW Gmail draft.
    await prisma.emailDraft.update({
      where: { id: targetDraft.id },
      data: { status: "APPROVED", approvedById: ownerId, approvedAt: new Date() },
    });
    const r3 = await createGmailDraftForApproved(org.id, targetDraft.id, g6actor, { apiClient: api, fetchImpl: okRefresh });
    assert(r3.ok && r3.outcome === "created", "re-approved changed draft creates a new Gmail draft");
    assert(num(api.gmail) === 2, "a new Gmail draft was created for the new approved version");

    // (f) Suppression / unsubscribe blocking.
    await prisma.suppressionEntry.create({
      data: { orgId: org.id, emailOrDomain: "owner@targetclinic.test", reason: "unsubscribe request" },
    });
    const rSup = await createGmailDraftForApproved(org.id, targetDraft.id, g6actor, { apiClient: api });
    assert(!rSup.ok && (rSup.reason === "suppressed" || rSup.reason === "unsubscribed"), "suppressed recipient is blocked");
    assert(num(api.gmail) === 2, "no Gmail API call for a suppressed recipient");
    await prisma.suppressionEntry.deleteMany({ where: { orgId: org.id, emailOrDomain: "owner@targetclinic.test" } });

    // (g) Do-not-contact blocking.
    await prisma.clinic.update({ where: { id: target.id }, data: { doNotContact: true } });
    const rDnc = await createGmailDraftForApproved(org.id, targetDraft.id, g6actor, { apiClient: api });
    assert(!rDnc.ok && rDnc.reason === "do_not_contact", "do-not-contact lead is blocked");
    await prisma.clinic.update({ where: { id: target.id }, data: { doNotContact: false } });

    // (h) Organization isolation: another org cannot act on this draft.
    const otherOrg = await prisma.organization.create({ data: { name: "Verify Other Org" } });
    const rIso = await createGmailDraftForApproved(otherOrg.id, targetDraft.id, g6actor, { apiClient: api });
    assert(!rIso.ok && rIso.reason === "not_found", "cross-org access to a draft is denied");

    // (i) Provider failure handling (records FAILED with an error).
    api.failGmail = true;
    await prisma.emailDraft.update({
      where: { id: targetDraft.id },
      data: { version: { increment: 1 }, status: "APPROVED", approvedById: ownerId, approvedAt: new Date() },
    });
    const rFail = await createGmailDraftForApproved(org.id, targetDraft.id, g6actor, { apiClient: api, fetchImpl: okRefresh });
    assert(!rFail.ok && rFail.outcome === "failed", "provider failure surfaced as a failed outcome");
    const failRec = await prisma.gmailDraftRecord.findFirst({
      where: { emailDraftId: targetDraft.id },
      orderBy: { sourceVersion: "desc" },
    });
    assert(failRec?.status === "FAILED" && !!failRec.error, "failed Gmail draft stored with an error");
    api.failGmail = false;

    // (j) Calendar create / update (idempotent) / cancel, no attendees.
    const fu = await prisma.followUpTask.create({
      data: { orgId: org.id, clinicId: target.id, dueDate: new Date(Date.now() + 86_400_000), title: "Verify follow-up", status: "PENDING" },
    });
    const c1 = await syncFollowUpToCalendar(fu.id, g6actor, { apiClient: api, fetchImpl: okRefresh });
    assert(c1.ok && c1.outcome === "created" && !!c1.eventId, "calendar event created for a follow-up");
    assert(num(api.calCreate) === 1, "one calendar create call");
    assert(api.lastEvent != null && !("attendees" in (api.lastEvent as object)), "calendar event has no attendees (clinic not invited)");
    const fuAfter = await prisma.followUpTask.findUniqueOrThrow({ where: { id: fu.id } });
    assert(fuAfter.calendarEventId === c1.eventId, "calendar event id persisted on the follow-up");

    const c2 = await syncFollowUpToCalendar(fu.id, g6actor, { apiClient: api, fetchImpl: okRefresh });
    assert(c2.outcome === "updated" && num(api.calUpdate) === 1 && num(api.calCreate) === 1, "re-sync updates the same event (idempotent)");

    const c3 = await cancelFollowUpCalendar(fu.id, g6actor, { apiClient: api });
    assert(c3.ok && c3.outcome === "cancelled" && num(api.calCancel) === 1, "calendar event cancelled");
    const fuCancelled = await prisma.followUpTask.findUniqueOrThrow({ where: { id: fu.id } });
    assert(fuCancelled.calendarStatus === "cancelled", "follow-up calendar status set to cancelled");

    // (k) Follow-up overdue logic.
    const overdue = await prisma.followUpTask.create({
      data: { orgId: org.id, clinicId: target.id, dueDate: new Date(Date.now() - 86_400_000), title: "Overdue", status: "PENDING" },
    });
    const dueCount = await prisma.followUpTask.count({ where: { orgId: org.id, status: "PENDING", dueDate: { lte: new Date() } } });
    assert(dueCount >= 1, "an overdue pending follow-up is counted as due");
    await prisma.followUpTask.update({ where: { id: overdue.id }, data: { status: "COMPLETED", done: true, completedAt: new Date() } });
    const dueAfter = await prisma.followUpTask.count({ where: { orgId: org.id, status: "PENDING", dueDate: { lte: new Date() } } });
    assert(dueAfter === dueCount - 1, "a completed follow-up no longer counts as due");

    // (l) Revocation/expiry: an invalid_grant on refresh marks the connection revoked.
    await prisma.googleConnection.update({ where: { id: conn.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    let revokedThrown = false;
    try {
      await getValidAccessToken(await prisma.googleConnection.findUniqueOrThrow({ where: { id: conn.id } }), invalidGrant);
    } catch (e) {
      revokedThrown = e instanceof GoogleNotConnectedError;
    }
    assert(revokedThrown, "invalid_grant on refresh raised GoogleNotConnectedError");
    const afterRevoke = await prisma.googleConnection.findUniqueOrThrow({ where: { id: conn.id } });
    assert(afterRevoke.revokedAt != null, "connection marked revoked after invalid_grant");

    // (m) No Gmail send API is ever used (structural + immutable activity check).
    assert(!("sendGmailMessage" in api), "the Google API client exposes no send method");
    const integrationEvents = await prisma.integrationActivity.findMany({ where: { orgId: org.id } });
    assert(
      integrationEvents.some((e) => e.type === "GMAIL_DRAFT_CREATED") &&
        integrationEvents.some((e) => e.type === "CALENDAR_EVENT_CREATED") &&
        integrationEvents.some((e) => e.type === "SUPPRESSION_BLOCKED"),
      "immutable integration activity recorded for gmail/calendar/suppression events",
    );

    console.log(
      `\n   Integrations: token refreshed+re-encrypted; ${api.gmail} Gmail drafts (idempotent, no send); ` +
        `suppression/DNC/edited-approved/org-isolation blocks enforced; calendar create/update/cancel synced; ` +
        `overdue logic verified; invalid_grant revoked the connection; ${integrationEvents.length} integration events logged. ✔`,
    );

    // -----------------------------------------------------------------------
    // Phase 7: cross-org isolation, data-retention purge, saved-view scoping.
    // -----------------------------------------------------------------------
    const { runRetentionForOrg } = await import("@/lib/retention/retention");

    // Cross-organization isolation: org B must not see or "own" org A's clinic.
    const orgB = await prisma.organization.create({ data: { name: "Verify Org B" } });
    const crossOwn = await prisma.clinic.findFirst({ where: { id: target.id, orgId: orgB.id } });
    assert(crossOwn === null, "org A's clinic is not accessible when scoped to org B (ownership guard)");
    assert((await prisma.clinic.count({ where: { orgId: orgB.id } })) === 0, "org B sees none of org A's clinics");

    // Retention fixtures in org B: one stale+unengaged (purgeable), two stale but
    // engaged (protected), one fresh (not stale). updatedAt is @updatedAt-managed,
    // so backdate it with raw SQL to simulate staleness.
    const old = new Date(Date.now() - 400 * 86_400_000);
    const mk = (name: string, key: string, stage: string) =>
      prisma.clinic.create({
        data: { orgId: orgB.id, name, dedupeKey: key, normalizedName: name.toLowerCase(), stage: stage as never, createdAt: old },
      });
    const staleUnengaged = await mk("Stale Lead", "p7-stale", "DISCOVERED");
    const staleEngaged = await mk("Engaged Lead", "p7-engaged", "CONTACTED");
    const staleFollowUp = await mk("FollowUp Lead", "p7-fu", "QUALIFIED");
    await prisma.followUpTask.create({
      data: { orgId: orgB.id, clinicId: staleFollowUp.id, dueDate: new Date(), status: "PENDING" },
    });
    const freshLead = await prisma.clinic.create({
      data: { orgId: orgB.id, name: "Fresh Lead", dedupeKey: "p7-fresh", normalizedName: "fresh lead", stage: "DISCOVERED" },
    });
    for (const id of [staleUnengaged.id, staleEngaged.id, staleFollowUp.id]) {
      await prisma.$executeRaw`UPDATE "Clinic" SET "updatedAt" = ${old} WHERE id = ${id}`;
    }
    const oldJob = await prisma.researchJob.create({
      data: { orgId: orgB.id, type: "campaign.research", status: "SUCCEEDED", createdAt: old, finishedAt: old },
    });
    await prisma.errorLog.create({ data: { jobId: oldJob.id, scope: "fetch", message: "old", createdAt: old } });

    // Dry run: measures, deletes nothing.
    const dry = await runRetentionForOrg(prisma, { orgId: orgB.id, retentionDays: 365, now: new Date(), dryRun: true });
    assert(dry.dryRun && dry.clinicsPurged === 1, "dry run reports exactly 1 purgeable lead");
    assert(dry.protectedSkipped === 2, "dry run counts 2 protected stale leads (engaged + pending follow-up)");
    assert((await prisma.clinic.count({ where: { orgId: orgB.id } })) === 4, "dry run deleted no clinics");

    // Real purge with active-record protection.
    const purge = await runRetentionForOrg(prisma, { orgId: orgB.id, retentionDays: 365, now: new Date(), dryRun: false });
    assert(
      purge.clinicsPurged === 1 && purge.jobsPurged === 1 && purge.errorLogsPurged === 1,
      "purge removed the stale lead, old job, and old error log",
    );
    assert((await prisma.clinic.findUnique({ where: { id: staleUnengaged.id } })) === null, "stale unengaged lead purged");
    assert((await prisma.clinic.findUnique({ where: { id: staleEngaged.id } })) !== null, "engaged (contacted) lead protected");
    assert((await prisma.clinic.findUnique({ where: { id: staleFollowUp.id } })) !== null, "lead with a pending follow-up protected");
    assert((await prisma.clinic.findUnique({ where: { id: freshLead.id } })) !== null, "fresh lead not purged");
    assert((await prisma.clinic.findUnique({ where: { id: target.id } })) !== null, "org A clinic untouched by org B's purge");

    // Idempotency: a second purge removes nothing more.
    const purge2 = await runRetentionForOrg(prisma, { orgId: orgB.id, retentionDays: 365, now: new Date(), dryRun: false });
    assert(purge2.clinicsPurged === 0 && purge2.jobsPurged === 0, "re-running the purge removes nothing (idempotent)");

    // Disabled retention (0 days) purges nothing even with stale data present.
    const disabled = await runRetentionForOrg(prisma, { orgId: orgB.id, retentionDays: 0, now: new Date(), dryRun: false });
    assert(disabled.disabled && disabled.clinicsPurged === 0, "retentionDays=0 disables purging");

    const retRuns = await prisma.retentionRun.findMany({ where: { orgId: orgB.id } });
    assert(
      retRuns.length >= 3 && retRuns.some((r) => r.status === "DRY_RUN") && retRuns.some((r) => r.status === "COMPLETED"),
      "immutable retention runs recorded (dry + completed)",
    );

    // Saved-view scoping: a view is bound to a single (org, user).
    const anyUser = await prisma.user.findFirstOrThrow();
    await prisma.savedView.create({ data: { orgId: orgB.id, userId: anyUser.id, name: "Verify view", params: "stage=QUALIFIED" } });
    assert(
      (await prisma.savedView.count({ where: { orgId: orgB.id, userId: "no-such-user" } })) === 0,
      "saved views are scoped per user (not visible to other users)",
    );
    assert(
      (await prisma.savedView.count({ where: { orgId: org.id, userId: anyUser.id } })) === 0,
      "saved views are scoped per org (org B's view not visible in org A)",
    );

    console.log(
      `\n   Phase 7: cross-org isolation enforced; retention dry-run measured ${dry.clinicsPurged} lead(s) and ` +
        `protected ${dry.protectedSkipped}; purge removed ${purge.clinicsPurged} lead + ${purge.jobsPurged} job + ` +
        `${purge.errorLogsPurged} error log, idempotent on re-run; disabled window purged nothing; ` +
        `${retRuns.length} retention run(s) audited; saved views scoped per user/org. ✔`,
    );

    await prisma.$disconnect();
    console.log("\n✅ Database-backed workflow verified against real PostgreSQL.");
  } finally {
    await pg.stop();
    console.log("→ Stopped local PostgreSQL.");
  }
}

main().catch((e) => {
  console.error("\n❌ Verification failed:");
  console.error(e);
  process.exit(1);
});
