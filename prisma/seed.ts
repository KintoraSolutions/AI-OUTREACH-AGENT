import { PrismaClient, PipelineStage, LeadSource, EmailStatus, Role, ActivityType } from "@prisma/client";
import { computeDedupeKey, normalizeName } from "../src/lib/leads/dedupe";

const prisma = new PrismaClient();

/**
 * Development seed. Everything created here is clearly marked as TEST DATA
 * (isTestData: true) and uses .test / example domains so it is never mistaken
 * for real clinic information.
 */
const TEST_USER_EMAIL = "founder@example-clinic-sales.test";

interface SeedClinic {
  name: string;
  category: string;
  websiteUrl?: string;
  mainPhone?: string;
  publicEmail?: string;
  bookingMethod?: string;
  stage: PipelineStage;
  locations: number;
  address?: string;
  contact?: { name: string; jobTitle: string; email?: string };
}

const CLINICS: SeedClinic[] = [
  {
    name: "Test Riverside Physiotherapy",
    category: "Physiotherapy",
    websiteUrl: "https://riverside-physio.example",
    mainPhone: "+1-555-0100",
    publicEmail: "info@riverside-physio.example",
    bookingMethod: "Call to book",
    stage: PipelineStage.DISCOVERED,
    locations: 2,
    address: "12 Test Street, Example City",
    contact: { name: "Alex Rivera", jobTitle: "Clinic Manager", email: "alex@riverside-physio.example" },
  },
  {
    name: "Test Downtown Dental Group",
    category: "Dental",
    websiteUrl: "https://downtown-dental.example",
    mainPhone: "+1-555-0111",
    publicEmail: "hello@downtown-dental.example",
    bookingMethod: "Online booking",
    stage: PipelineStage.QUALIFIED,
    locations: 3,
    address: "88 Sample Ave, Example City",
    contact: { name: "Jordan Lee", jobTitle: "Practice Owner", email: "jordan@downtown-dental.example" },
  },
  {
    name: "Test Harbor Optometry",
    category: "Optometry",
    websiteUrl: "https://harbor-optometry.example",
    mainPhone: "+1-555-0122",
    bookingMethod: "Contact form",
    stage: PipelineStage.NEEDS_REVIEW,
    locations: 1,
    address: "5 Demo Road, Example City",
  },
  {
    name: "Test Summit Chiropractic",
    category: "Chiropractic",
    websiteUrl: "https://summit-chiro.example",
    mainPhone: "+1-555-0133",
    publicEmail: "care@summit-chiro.example",
    bookingMethod: "Call to book",
    stage: PipelineStage.CONTACTED,
    locations: 1,
    contact: { name: "Sam Okafor", jobTitle: "Owner", email: "sam@summit-chiro.example" },
  },
  {
    name: "Test Lakeside Family Medicine",
    category: "Family medicine",
    websiteUrl: "https://lakeside-family.example",
    mainPhone: "+1-555-0144",
    publicEmail: "reception@lakeside-family.example",
    bookingMethod: "Call to book",
    stage: PipelineStage.REPLIED,
    locations: 4,
    address: "200 Placeholder Blvd, Example City",
    contact: { name: "Dana Cho", jobTitle: "Administrator", email: "dana@lakeside-family.example" },
  },
  {
    name: "Test Meadow Dermatology",
    category: "Dermatology",
    websiteUrl: "https://meadow-derm.example",
    mainPhone: "+1-555-0155",
    bookingMethod: "Online booking",
    stage: PipelineStage.DISCOVERED,
    locations: 1,
  },
  {
    name: "Test Pinewood Rehabilitation",
    category: "Rehabilitation",
    websiteUrl: "https://pinewood-rehab.example",
    mainPhone: "+1-555-0166",
    publicEmail: "info@pinewood-rehab.example",
    bookingMethod: "Call to book",
    stage: PipelineStage.MEETING_BOOKED,
    locations: 2,
  },
  {
    name: "Test Cedar Counselling",
    category: "Psychology and counselling",
    mainPhone: "+1-555-0177",
    bookingMethod: "Email",
    stage: PipelineStage.FOLLOW_UP_LATER,
    locations: 1,
  },
];

async function main() {
  const user = await prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    update: {},
    create: { email: TEST_USER_EMAIL, name: "Test Founder", emailVerified: new Date() },
  });

  let org = await prisma.organization.findFirst({
    where: { memberships: { some: { userId: user.id } } },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: "Example Clinic Sales (Test)",
        companyName: "Example Clinic Sales",
        portfolioUrl: "https://portfolio.example",
        contactUrl: "https://portfolio.example/book",
        senderName: "Test Founder",
        senderEmail: "founder@example-clinic-sales.test",
        klearqProductName: "KlearQ",
        klearqTagline: "Phone queue and call management for clinics",
        klearqUrl: "https://klearq.example",
        klearqCapabilities: [
          "Centralized call queues",
          "Missed-call tracking",
          "Callback lists",
          "Call-volume analytics",
        ],
        memberships: { create: { userId: user.id, role: Role.OWNER } },
      },
    });
  }

  for (const c of CLINICS) {
    const dedupeKey = computeDedupeKey({ name: c.name, websiteUrl: c.websiteUrl, primaryAddress: c.address });
    const existing = await prisma.clinic.findUnique({
      where: { orgId_dedupeKey: { orgId: org.id, dedupeKey } },
    });
    if (existing) continue;

    await prisma.clinic.create({
      data: {
        orgId: org.id,
        name: c.name,
        category: c.category,
        websiteUrl: c.websiteUrl ?? null,
        mainPhone: c.mainPhone ?? null,
        publicEmail: c.publicEmail ?? null,
        bookingMethod: c.bookingMethod ?? null,
        locationCount: c.locations,
        stage: c.stage,
        leadSource: LeadSource.MANUAL,
        isTestData: true,
        dedupeKey,
        normalizedName: normalizeName(c.name),
        createdById: user.id,
        locations: c.address
          ? { create: [{ label: "Primary", address: c.address }] }
          : undefined,
        contacts: c.contact
          ? {
              create: [
                {
                  name: c.contact.name,
                  jobTitle: c.contact.jobTitle,
                  email: c.contact.email ?? null,
                  emailStatus: c.contact.email ? EmailStatus.UNVERIFIED : EmailStatus.UNKNOWN,
                  isDecisionMaker: true,
                },
              ],
            }
          : undefined,
        activities: {
          create: [
            {
              type: ActivityType.LEAD_CREATED,
              actorName: "Seed",
              note: "Seeded test lead.",
            },
          ],
        },
      },
    });
  }

  const count = await prisma.clinic.count({ where: { orgId: org.id } });
  console.log(`Seed complete. Org "${org.name}" now has ${count} clinic(s).`);
  console.log(`Sign in (dev) with: ${TEST_USER_EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
