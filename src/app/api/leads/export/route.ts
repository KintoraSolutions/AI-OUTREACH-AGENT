import { NextRequest, NextResponse } from "next/server";
import { Prisma, PipelineStage } from "@prisma/client";
import { prisma } from "@/lib/db";
import { PermissionError, requireRole } from "@/lib/auth/rbac";
import { Role } from "@prisma/client";
import { STAGE_LABELS, LEAD_SOURCE_LABELS } from "@/lib/leads/constants";
import { toCsv } from "@/lib/csv";

export async function GET(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireRole(Role.MEMBER);
  } catch (e) {
    if (e instanceof PermissionError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  const sp = req.nextUrl.searchParams;
  const where: Prisma.ClinicWhereInput = { orgId: ctx.orgId };
  if (!sp.get("test")) where.isTestData = false;
  const category = sp.get("category");
  if (category) where.category = category;
  const stage = sp.get("stage");
  if (stage && (Object.values(PipelineStage) as string[]).includes(stage)) {
    where.stage = stage as PipelineStage;
  }
  const q = sp.get("q");
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { websiteUrl: { contains: q, mode: "insensitive" } },
      { mainPhone: { contains: q, mode: "insensitive" } },
      { publicEmail: { contains: q, mode: "insensitive" } },
    ];
  }

  const clinics = await prisma.clinic.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000,
    include: {
      locations: { take: 1, orderBy: { collectedAt: "asc" } },
      contacts: { take: 1, orderBy: { isDecisionMaker: "desc" } },
    },
  });

  const csv = toCsv(clinics, [
    { header: "Name", value: (c) => c.name },
    { header: "Category", value: (c) => c.category ?? "" },
    { header: "Website", value: (c) => c.websiteUrl ?? "" },
    { header: "Phone", value: (c) => c.mainPhone ?? "" },
    { header: "Email", value: (c) => c.publicEmail ?? "" },
    { header: "Contact Page", value: (c) => c.contactPageUrl ?? "" },
    { header: "Booking Method", value: (c) => c.bookingMethod ?? "" },
    { header: "Locations", value: (c) => c.locationCount },
    { header: "Primary Address", value: (c) => c.locations[0]?.address ?? "" },
    { header: "Contact Name", value: (c) => c.contacts[0]?.name ?? "" },
    { header: "Contact Title", value: (c) => c.contacts[0]?.jobTitle ?? "" },
    { header: "Contact Email", value: (c) => c.contacts[0]?.email ?? "" },
    { header: "Stage", value: (c) => STAGE_LABELS[c.stage] },
    { header: "Do Not Contact", value: (c) => (c.doNotContact ? "yes" : "no") },
    { header: "Source", value: (c) => LEAD_SOURCE_LABELS[c.leadSource] },
    { header: "Follow-up", value: (c) => (c.followUpDate ? c.followUpDate.toISOString().slice(0, 10) : "") },
    { header: "Created", value: (c) => c.createdAt.toISOString().slice(0, 10) },
  ]);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
