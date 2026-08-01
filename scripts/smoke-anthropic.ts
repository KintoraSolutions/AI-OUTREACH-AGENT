/**
 * Controlled, single-clinic smoke test against the REAL Anthropic API.
 *
 * Purpose (Phase 6, step 1): prove end-to-end that, with a real
 * `ANTHROPIC_API_KEY`, the drafting engine produces schema-valid structured
 * output, maps every factual claim to stored evidence, passes the deterministic
 * hallucination guard, persists the draft + version snapshot to a real database,
 * and handles configuration/API errors clearly. It contacts no one: it only
 * calls the model and writes to a throwaway local Postgres.
 *
 * Run with: npm run smoke:ai
 *
 * Behavior:
 *   - If ANTHROPIC_API_KEY is NOT set, the test does not fabricate a result. It
 *     demonstrates the clear configuration error and reports PENDING (exit 0),
 *     because the operational, real-API check cannot run without a key.
 *   - If the key is set, it runs the full check against embedded Postgres and a
 *     REAL Anthropic call, and exits non-zero on any assertion or API failure.
 */
import { readFileSync } from "node:fs";
import { startLocalPostgres } from "./local-postgres.mjs";

// ---- Load .env (dependency-free) so a standalone tsx run sees credentials ----
function loadDotEnv(path = ".env") {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) || !process.env[key]) process.env[key] = value;
  }
}
loadDotEnv();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const hasKey =
  typeof process.env.ANTHROPIC_API_KEY === "string" &&
  process.env.ANTHROPIC_API_KEY.trim().length > 0;

async function reportPending() {
  // Demonstrate the clear configuration-error path without contacting anyone.
  const { getAiProvider } = await import("@/lib/ai/provider");
  const { AiNotConfiguredError } = await import("@/lib/ai/errors");
  const provider = getAiProvider();

  console.log(`→ Provider: ${provider.name}, model: ${provider.model}`);
  assert(provider.isConfigured() === false, "provider reports unconfigured without a key");

  let clearError = "";
  try {
    await provider.generateStructured({
      system: "noop",
      prompt: "noop",
      toolName: "noop",
      toolDescription: "noop",
      schema: { type: "object" },
      parse: (raw) => raw,
    });
  } catch (e) {
    if (e instanceof AiNotConfiguredError) clearError = e.message;
    else throw e;
  }
  assert(clearError.length > 0, "an unconfigured call throws a clear AiNotConfiguredError");

  console.log(`→ Configuration error handled clearly: "${clearError}"`);
  console.log(
    "\n⏸️  SMOKE TEST PENDING: ANTHROPIC_API_KEY is not set in this environment.\n" +
      "   The real-model call was intentionally NOT faked. Set ANTHROPIC_API_KEY in .env\n" +
      "   (optionally AI_MODEL) and re-run `npm run smoke:ai` to perform the operational check.",
  );
  // Pending is not a failure; exit 0 so the honest status is reported plainly.
  process.exit(0);
}

async function runRealSmokeTest() {
  const PG_URL = "postgresql://postgres:postgres@localhost:5432/outreach?schema=public";
  process.env.DATABASE_URL = PG_URL;
  process.env.DIRECT_URL = PG_URL;

  console.log("→ ANTHROPIC_API_KEY present. Starting real local PostgreSQL…");
  const { pg } = await startLocalPostgres({ fresh: true });

  try {
    const { execSync } = await import("node:child_process");
    const env = { ...process.env };
    console.log("→ Applying migrations (migrate deploy)…");
    execSync("npx prisma migrate deploy", { stdio: "inherit", env });
    execSync("npx prisma generate", { stdio: "inherit", env });

    const { prisma } = await import("@/lib/db");
    const { getAiProvider } = await import("@/lib/ai/provider");
    const { describeAiProvider } = await import("@/lib/ai/provider");
    const { draftAndSaveClinic } = await import("@/lib/ai/draft-repository");
    const { Confidence } = await import("@prisma/client");

    const desc = describeAiProvider();
    console.log(`→ Provider: ${desc.name}, model: ${desc.model}, configured: ${desc.configured}`);
    assert(desc.configured, "provider is configured");

    // ---- Build one controlled test clinic with citable website evidence ----
    const org = await prisma.organization.create({
      data: {
        name: "Smoke Test Agency",
        companyName: "Smoke Test Agency",
        portfolioUrl: "https://smoke.example/work",
        contactUrl: "https://smoke.example/contact",
        senderName: "Sender One",
      },
    });
    const clinic = await prisma.clinic.create({
      data: {
        orgId: org.id,
        name: "Smoke Test Family Dental",
        category: "Dental",
        websiteUrl: "https://smoke-clinic.example",
        publicEmail: "info@smoke-clinic.example",
        dedupeKey: "smoke-clinic-1",
        isTestData: true,
        contacts: {
          create: [
            {
              name: "Dr. Alex Rivera",
              jobTitle: "Practice Owner",
              email: "alex@smoke-clinic.example",
              isDecisionMaker: true,
            },
          ],
        },
      },
    });
    const audit = await prisma.websiteAudit.create({
      data: { clinicId: clinic.id, url: clinic.websiteUrl!, status: "completed" },
    });
    await prisma.auditFinding.createMany({
      data: [
        {
          auditId: audit.id,
          category: "WEBSITE",
          code: "web_no_booking_cta",
          ruleVersion: "default-v1",
          finding: "No clear online booking action for new patients",
          evidence: "The homepage has no visible 'Book appointment' button; booking directs to a phone number.",
          sourceUrl: clinic.websiteUrl!,
          confidence: Confidence.STRONG_INFERENCE,
          isFact: false,
        },
        {
          auditId: audit.id,
          category: "WEBSITE",
          code: "web_missing_https",
          ruleVersion: "default-v1",
          finding: "Site is not served over HTTPS",
          evidence: "The site loaded over http:// with no TLS certificate.",
          sourceUrl: clinic.websiteUrl!,
          confidence: Confidence.VERIFIED,
          isFact: true,
        },
      ],
    });
    await prisma.leadScore.create({
      data: {
        clinicId: clinic.id,
        websiteScore: 14,
        softwareScore: 2,
        klearqScore: 3,
        contactabilityScore: 6,
        businessFitScore: 9,
        overallScore: 34,
        recommendedService: "WEBSITE",
        confidence: "MEDIUM",
        breakdown: {},
        weightsVersion: "default-v1",
      },
    });

    // ---- Real generation + persistence -----------------------------------
    console.log("→ Generating a draft with the REAL Anthropic model…");
    const { outcome, result } = await draftAndSaveClinic(org.id, clinic.id, getAiProvider(), {
      id: null,
      name: "Smoke test",
    });
    console.log(`→ Outcome: ${outcome}`);
    assert(result !== null, "engine returned a result");
    assert(outcome === "generated", `draft generated, not blocked (was ${outcome})`);

    const draft = await prisma.emailDraft.findUniqueOrThrow({
      where: { clinicId: clinic.id },
      include: { versions: true },
    });

    // Structured output + persistence
    assert(draft.subject.trim().length > 0, "subject is non-empty (structured output)");
    assert(draft.body.trim().length > 0, "body is non-empty (structured output)");
    assert(draft.aiProvider === "anthropic", `real provider recorded (was ${draft.aiProvider})`);
    assert(!!draft.aiModel, "model recorded on the draft");
    assert(draft.promptVersion === "draft-v1", "prompt version recorded");
    assert(draft.generatedAt instanceof Date, "generation timestamp recorded");
    assert(draft.versions.length === 1, "an immutable version snapshot was written");

    // Evidence mapping — every stored evidence id must be a real finding.
    assert(draft.evidenceFindingIds.length >= 1, "at least one evidence finding id stored");
    const findingRows = await prisma.auditFinding.findMany({
      where: { id: { in: draft.evidenceFindingIds } },
    });
    assert(
      findingRows.length === draft.evidenceFindingIds.length,
      "every stored evidence id maps to a real audit finding",
    );

    // Guard validation ran (claim map present; body used the clinic name).
    assert(Array.isArray(draft.personalizationEvidence), "personalization evidence stored");
    assert(draft.body.includes(clinic.name), "clinic name preserved in the body");
    assert(draft.status === "GENERATED" || draft.status === "EDITED", "draft is in review, not blocked");

    console.log("\n   Claim-to-evidence mapping:");
    const claimMap = (draft.claimMap as { claim?: string; code?: string; supported?: boolean }[] | null) ?? [];
    for (const c of claimMap) {
      console.log(`   • "${c.claim ?? ""}" → ${c.code ?? "?"} (${c.supported ? "supported" : "UNSUPPORTED"})`);
    }
    console.log(`\n   Subject: ${draft.subject}`);
    console.log(`   Word count: ${draft.wordCount ?? "?"}, confidence: ${draft.confidence}`);
    if (draft.reviewWarnings.length) console.log(`   Warnings: ${draft.reviewWarnings.join("; ")}`);

    await prisma.$disconnect();
    console.log("\n✅ Real-Anthropic smoke test passed: structured output, evidence mapping, guard, and persistence verified.");
  } finally {
    await pg.stop();
    console.log("→ Stopped local PostgreSQL.");
  }
}

async function main() {
  if (!hasKey) {
    await reportPending();
    return;
  }
  await runRealSmokeTest();
}

main().catch((e) => {
  console.error("\n❌ Smoke test failed:");
  console.error(e);
  process.exit(1);
});
