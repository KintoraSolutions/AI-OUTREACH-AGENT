"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ActivityType,
  EmailStatus,
  LeadSource,
  PipelineStage,
  Prisma,
  Role,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { computeDedupeKey, normalizeName } from "@/lib/leads/dedupe";
import {
  OrgContext,
  PermissionError,
  requireRole,
} from "@/lib/auth/rbac";
import {
  fail,
  fieldErrorsFromZod,
  type FormState,
} from "@/lib/actions/form";
import {
  bulkStageSchema,
  contactSchema,
  csvLeadRowSchema,
  leadCreateSchema,
  leadEditSchema,
  locationSchema,
  noteSchema,
  stageUpdateSchema,
} from "@/lib/validation/lead";
import { parseCsv } from "@/lib/csv";

const DUPLICATE_MSG =
  "A clinic with a matching website or name already exists in this organization.";

async function ctxOrError(
  min: Role,
): Promise<{ ctx: OrgContext } | { error: FormState }> {
  try {
    const ctx = await requireRole(min);
    return { ctx };
  } catch (e) {
    if (e instanceof PermissionError) return { error: fail(e.message) };
    throw e;
  }
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Verify a clinic belongs to the active org before mutating it. */
async function ownedClinic(orgId: string, clinicId: string) {
  return prisma.clinic.findFirst({ where: { id: clinicId, orgId } });
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createLead(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const parsed = leadCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const d = parsed.data;
  const dedupeKey = computeDedupeKey({
    name: d.name,
    websiteUrl: d.websiteUrl,
    primaryAddress: d.primaryAddress,
  });

  let clinicId: string;
  try {
    const clinic = await prisma.clinic.create({
      data: {
        orgId: ctx.orgId,
        name: d.name,
        category: d.category ?? null,
        websiteUrl: d.websiteUrl ?? null,
        mainPhone: d.mainPhone ?? null,
        publicEmail: d.publicEmail ?? null,
        contactPageUrl: d.contactPageUrl ?? null,
        bookingMethod: d.bookingMethod ?? null,
        onlineBookingUrl: d.onlineBookingUrl ?? null,
        locationCount: d.locationCount,
        stage: d.stage,
        doNotContact: d.doNotContact,
        isTestData: d.isTestData,
        leadSource: LeadSource.MANUAL,
        dedupeKey,
        normalizedName: normalizeName(d.name),
        createdById: ctx.userId,
        locations: d.primaryAddress
          ? { create: [{ address: d.primaryAddress, label: "Primary" }] }
          : undefined,
        contacts:
          d.contactName || d.contactEmail || d.contactPhone
            ? {
                create: [
                  {
                    name: d.contactName ?? null,
                    jobTitle: d.contactTitle ?? null,
                    email: d.contactEmail ?? null,
                    emailStatus: d.contactEmail ? EmailStatus.UNVERIFIED : EmailStatus.UNKNOWN,
                    phone: d.contactPhone ?? null,
                    isDecisionMaker: Boolean(d.contactTitle),
                  },
                ],
              }
            : undefined,
        activities: {
          create: [
            {
              type: ActivityType.LEAD_CREATED,
              actorId: ctx.userId,
              actorName: ctx.userName,
              note: "Lead created manually.",
            },
          ],
        },
      },
    });
    clinicId = clinic.id;
    if (d.note) {
      await logActivity({
        clinicId,
        type: ActivityType.NOTE_ADDED,
        actorId: ctx.userId,
        actorName: ctx.userName,
        note: d.note,
      });
    }
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false, error: DUPLICATE_MSG, fieldErrors: { name: [DUPLICATE_MSG] } };
    }
    throw e;
  }

  revalidatePath("/leads");
  redirect(`/leads/${clinicId}`);
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

export async function updateLead(
  clinicId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const existing = await ownedClinic(ctx.orgId, clinicId);
  if (!existing) return fail("Lead not found.");

  const parsed = leadEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Please fix the errors below.", fieldErrors: fieldErrorsFromZod(parsed.error) };
  }
  const d = parsed.data;
  // Mirror create/import: include the primary address so the dedupe key stays
  // stable for website-less leads (otherwise an edit would drop the address
  // component and could collide with another same-name lead).
  const primaryLocation = await prisma.clinicLocation.findFirst({
    where: { clinicId },
    orderBy: { collectedAt: "asc" },
    select: { address: true },
  });
  const dedupeKey = computeDedupeKey({
    name: d.name,
    websiteUrl: d.websiteUrl,
    primaryAddress: primaryLocation?.address,
  });

  try {
    await prisma.clinic.update({
      where: { id: clinicId },
      data: {
        name: d.name,
        category: d.category ?? null,
        websiteUrl: d.websiteUrl ?? null,
        mainPhone: d.mainPhone ?? null,
        publicEmail: d.publicEmail ?? null,
        contactPageUrl: d.contactPageUrl ?? null,
        bookingMethod: d.bookingMethod ?? null,
        onlineBookingUrl: d.onlineBookingUrl ?? null,
        locationCount: d.locationCount,
        stage: d.stage,
        doNotContact: d.doNotContact,
        followUpDate: d.followUpDate ?? null,
        dedupeKey,
        normalizedName: normalizeName(d.name),
      },
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false, error: DUPLICATE_MSG, fieldErrors: { name: [DUPLICATE_MSG] } };
    }
    throw e;
  }

  await logActivity({
    clinicId,
    type: ActivityType.LEAD_UPDATED,
    actorId: ctx.userId,
    actorName: ctx.userName,
    note: "Lead details updated.",
  });
  if (existing.stage !== d.stage) {
    await logActivity({
      clinicId,
      type: ActivityType.STAGE_CHANGED,
      actorId: ctx.userId,
      actorName: ctx.userName,
      note: `Stage changed from ${existing.stage} to ${d.stage}.`,
      metadata: { from: existing.stage, to: d.stage },
    });
  }

  revalidatePath(`/leads/${clinicId}`);
  revalidatePath("/leads");
  redirect(`/leads/${clinicId}`);
}

// ---------------------------------------------------------------------------
// Stage / bulk / do-not-contact
// ---------------------------------------------------------------------------

export async function setStage(clinicId: string, stage: PipelineStage): Promise<void> {
  const ctx = await requireRole(Role.MEMBER);
  const parsed = stageUpdateSchema.safeParse({ stage });
  if (!parsed.success) return;
  const existing = await ownedClinic(ctx.orgId, clinicId);
  if (!existing || existing.stage === parsed.data.stage) return;

  await prisma.clinic.update({ where: { id: clinicId }, data: { stage: parsed.data.stage } });
  await logActivity({
    clinicId,
    type: ActivityType.STAGE_CHANGED,
    actorId: ctx.userId,
    actorName: ctx.userName,
    note: `Stage changed from ${existing.stage} to ${parsed.data.stage}.`,
    metadata: { from: existing.stage, to: parsed.data.stage },
  });
  revalidatePath(`/leads/${clinicId}`);
  revalidatePath("/leads");
}

export async function bulkSetStage(ids: string[], stage: PipelineStage): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const parsed = bulkStageSchema.safeParse({ ids, stage });
  if (!parsed.success) return { ok: false, error: "Invalid selection.", fieldErrors: fieldErrorsFromZod(parsed.error) };

  const owned = await prisma.clinic.findMany({
    where: { id: { in: parsed.data.ids }, orgId: ctx.orgId },
    select: { id: true },
  });
  const ownedIds = owned.map((c) => c.id);
  if (ownedIds.length === 0) return fail("No matching leads found.");

  await prisma.clinic.updateMany({
    where: { id: { in: ownedIds }, orgId: ctx.orgId },
    data: { stage: parsed.data.stage },
  });
  await prisma.outreachActivity.createMany({
    data: ownedIds.map((id) => ({
      clinicId: id,
      type: ActivityType.STAGE_CHANGED,
      actorId: ctx.userId,
      actorName: ctx.userName,
      note: `Stage set to ${parsed.data.stage} (bulk).`,
    })),
  });

  revalidatePath("/leads");
  return { ok: true, message: `Updated ${ownedIds.length} lead(s).` };
}

export async function bulkSetDoNotContact(ids: string[], value: boolean): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  if (!Array.isArray(ids) || ids.length === 0) return fail("Select at least one lead.");
  if (ids.length > 500) return fail("Select 500 or fewer leads at a time.");

  const owned = await prisma.clinic.findMany({
    where: { id: { in: ids }, orgId: ctx.orgId },
    select: { id: true, publicEmail: true },
  });
  if (owned.length === 0) return fail("No matching leads found.");
  const ownedIds = owned.map((c) => c.id);

  await prisma.clinic.updateMany({
    where: { id: { in: ownedIds }, orgId: ctx.orgId },
    data: { doNotContact: value },
  });

  // Setting do-not-contact also suppresses the lead's public email (unsubscribe
  // parity), matching the single-lead action.
  if (value) {
    const emails = [...new Set(owned.map((c) => c.publicEmail).filter((e): e is string => Boolean(e)))];
    for (const email of emails) {
      await prisma.suppressionEntry.upsert({
        where: { orgId_emailOrDomain: { orgId: ctx.orgId, emailOrDomain: email } },
        create: {
          orgId: ctx.orgId,
          emailOrDomain: email,
          reason: "Do-not-contact set on lead (bulk)",
          createdById: ctx.userId,
        },
        update: {},
      });
    }
  }

  await prisma.outreachActivity.createMany({
    data: ownedIds.map((id) => ({
      clinicId: id,
      type: ActivityType.DO_NOT_CONTACT_SET,
      actorId: ctx.userId,
      actorName: ctx.userName,
      note: value ? "Marked do-not-contact (bulk)." : "Cleared do-not-contact (bulk).",
    })),
  });

  revalidatePath("/leads");
  return { ok: true, message: `${value ? "Suppressed" : "Cleared"} ${ownedIds.length} lead(s).` };
}

export async function setDoNotContact(clinicId: string, value: boolean): Promise<void> {
  const ctx = await requireRole(Role.MEMBER);
  const clinic = await ownedClinic(ctx.orgId, clinicId);
  if (!clinic) return;

  await prisma.clinic.update({ where: { id: clinicId }, data: { doNotContact: value } });
  if (value && clinic.publicEmail) {
    await prisma.suppressionEntry.upsert({
      where: { orgId_emailOrDomain: { orgId: ctx.orgId, emailOrDomain: clinic.publicEmail } },
      create: {
        orgId: ctx.orgId,
        emailOrDomain: clinic.publicEmail,
        reason: "Do-not-contact set on lead",
        createdById: ctx.userId,
      },
      update: {},
    });
  }
  await logActivity({
    clinicId,
    type: ActivityType.DO_NOT_CONTACT_SET,
    actorId: ctx.userId,
    actorName: ctx.userName,
    note: value ? "Marked do-not-contact." : "Cleared do-not-contact.",
  });
  revalidatePath(`/leads/${clinicId}`);
  revalidatePath("/leads");
}

// ---------------------------------------------------------------------------
// Notes / contacts / locations / follow-ups
// ---------------------------------------------------------------------------

export async function addNote(
  clinicId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!(await ownedClinic(ctx.orgId, clinicId))) return fail("Lead not found.");

  const parsed = noteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error) };

  await logActivity({
    clinicId,
    type: ActivityType.NOTE_ADDED,
    actorId: ctx.userId,
    actorName: ctx.userName,
    note: parsed.data.note,
  });
  revalidatePath(`/leads/${clinicId}`);
  return { ok: true, message: "Note added." };
}

export async function addContact(
  clinicId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!(await ownedClinic(ctx.orgId, clinicId))) return fail("Lead not found.");

  const parsed = contactSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error) };
  const c = parsed.data;

  await prisma.contact.create({
    data: {
      clinicId,
      name: c.name ?? null,
      jobTitle: c.jobTitle ?? null,
      email: c.email ?? null,
      emailStatus: c.email ? EmailStatus.UNVERIFIED : EmailStatus.UNKNOWN,
      phone: c.phone ?? null,
      isDecisionMaker: c.isDecisionMaker,
    },
  });
  await logActivity({
    clinicId,
    type: ActivityType.LEAD_UPDATED,
    actorId: ctx.userId,
    actorName: ctx.userName,
    note: `Added contact ${c.name ?? c.email ?? ""}.`.trim(),
  });
  revalidatePath(`/leads/${clinicId}`);
  return { ok: true, message: "Contact added." };
}

export async function addLocation(
  clinicId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;
  if (!(await ownedClinic(ctx.orgId, clinicId))) return fail("Lead not found.");

  const parsed = locationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFromZod(parsed.error) };
  const l = parsed.data;

  await prisma.clinicLocation.create({
    data: {
      clinicId,
      label: l.label ?? null,
      address: l.address ?? null,
      phone: l.phone ?? null,
    },
  });
  const count = await prisma.clinicLocation.count({ where: { clinicId } });
  await prisma.clinic.update({
    where: { id: clinicId },
    data: { locationCount: Math.max(count, 1) },
  });
  await logActivity({
    clinicId,
    type: ActivityType.LEAD_UPDATED,
    actorId: ctx.userId,
    actorName: ctx.userName,
    note: "Added a location.",
  });
  revalidatePath(`/leads/${clinicId}`);
  return { ok: true, message: "Location added." };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteLead(clinicId: string): Promise<void> {
  const ctx = await requireRole(Role.ADMIN);
  const clinic = await ownedClinic(ctx.orgId, clinicId);
  if (!clinic) return;
  await prisma.clinic.delete({ where: { id: clinicId } });
  revalidatePath("/leads");
  redirect("/leads");
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "clinic", "clinic name", "business", "business name", "company"],
  category: ["category", "type", "specialty", "specialty type"],
  websiteUrl: ["website", "url", "site", "website url", "web"],
  mainPhone: ["phone", "telephone", "main phone", "phone number", "tel"],
  publicEmail: ["email", "business email", "public email", "contact email address"],
  contactPageUrl: ["contact page", "contact url", "contact page url"],
  bookingMethod: ["booking", "booking method", "how to book"],
  address: ["address", "location", "street", "full address"],
  contactName: ["contact name", "contact", "owner", "manager", "director"],
  contactTitle: ["contact title", "title", "job title", "role"],
  contactEmail: ["contact email", "owner email", "manager email"],
};

function mapCsvRow(row: Record<string, string>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [header, value] of Object.entries(row)) {
    if (!value) continue;
    const key = header.trim().toLowerCase();
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(key) && !mapped[field]) {
        mapped[field] = value;
        break;
      }
    }
  }
  return mapped;
}

export async function importLeadsCsv(_prev: FormState, formData: FormData): Promise<FormState> {
  const guard = await ctxOrError(Role.MEMBER);
  if ("error" in guard) return guard.error;
  const { ctx } = guard;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail("Choose a CSV file to import.");
  }
  if (file.size > 5 * 1024 * 1024) {
    return fail("File is too large (max 5 MB).");
  }

  const text = await file.text();
  const { rows, headers, errors } = parseCsv(text);
  if (headers.length === 0 || rows.length === 0) {
    return fail("The CSV has no data rows, or headers could not be read.");
  }

  let created = 0;
  let duplicates = 0;
  const invalid: string[] = [];

  // Validate every row and compute its dedupe key first, so the existing-key
  // lookup below is bounded to THIS import's keys rather than loading every
  // clinic in the org into memory.
  const prepared: { r: ReturnType<typeof csvLeadRowSchema.parse>; key: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const mapped = mapCsvRow(rows[i]!);
    const parsed = csvLeadRowSchema.safeParse(mapped);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      invalid.push(`Row ${i + 2}: ${first?.message ?? "invalid"}`);
      continue;
    }
    const r = parsed.data;
    const key = computeDedupeKey({
      name: r.name,
      websiteUrl: r.websiteUrl,
      primaryAddress: r.address,
    });
    prepared.push({ r, key });
  }

  const uniqueKeys = [...new Set(prepared.map((p) => p.key))];
  const existing = uniqueKeys.length
    ? await prisma.clinic.findMany({
        where: { orgId: ctx.orgId, dedupeKey: { in: uniqueKeys } },
        select: { dedupeKey: true },
      })
    : [];
  const seenKeys = new Set(existing.map((c) => c.dedupeKey));

  for (const { r, key } of prepared) {
    if (seenKeys.has(key)) {
      duplicates++;
      continue;
    }
    seenKeys.add(key);

    try {
      await prisma.clinic.create({
      data: {
        orgId: ctx.orgId,
        name: r.name,
        category: r.category ?? null,
        websiteUrl: r.websiteUrl ?? null,
        mainPhone: r.mainPhone ?? null,
        publicEmail: r.publicEmail ?? null,
        contactPageUrl: r.contactPageUrl ?? null,
        bookingMethod: r.bookingMethod ?? null,
        dedupeKey: key,
        normalizedName: normalizeName(r.name),
        leadSource: LeadSource.CSV_IMPORT,
        createdById: ctx.userId,
        locations: r.address ? { create: [{ address: r.address, label: "Primary" }] } : undefined,
        contacts:
          r.contactName || r.contactEmail
            ? {
                create: [
                  {
                    name: r.contactName ?? null,
                    jobTitle: r.contactTitle ?? null,
                    email: r.contactEmail ?? null,
                    emailStatus: r.contactEmail ? EmailStatus.UNVERIFIED : EmailStatus.UNKNOWN,
                    isDecisionMaker: Boolean(r.contactTitle),
                  },
                ],
              }
            : undefined,
        activities: {
          create: [
            {
              type: ActivityType.LEAD_IMPORTED,
              actorId: ctx.userId,
              actorName: ctx.userName,
              note: "Imported from CSV.",
            },
          ],
        },
      },
      });
      created++;
    } catch (e) {
      // A concurrent import may have created the same clinic; the DB unique
      // constraint is the backstop. Treat it as a skipped duplicate rather than
      // a fatal error, so one race never aborts the whole import.
      if (isUniqueViolation(e)) {
        duplicates++;
        continue;
      }
      throw e;
    }
  }

  revalidatePath("/leads");
  const parts = [`Imported ${created} lead(s).`];
  if (duplicates) parts.push(`${duplicates} duplicate(s) skipped.`);
  if (invalid.length) parts.push(`${invalid.length} row(s) invalid.`);
  if (errors.length) parts.push(`${errors.length} parse warning(s).`);

  return {
    ok: true,
    message: parts.join(" "),
    fieldErrors: invalid.length ? { rows: invalid.slice(0, 10) } : undefined,
  };
}
