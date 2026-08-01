import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/app/page-header";
import { LeadForm } from "@/components/app/lead-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { updateLead } from "@/app/(dashboard)/leads/actions";

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrgContext();
  const canEdit = roleAtLeast(ctx.role, Role.MEMBER);

  const clinic = await prisma.clinic.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!clinic) notFound();

  if (!canEdit) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <PageHeader title={`Edit ${clinic.name}`} />
        <Alert variant="warning">
          <AlertDescription>You have read-only access and cannot edit leads.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const action = updateLead.bind(null, clinic.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={`Edit ${clinic.name}`} description="Update clinic details and pipeline stage." />
      <LeadForm
        action={action}
        mode="edit"
        cancelHref={`/leads/${clinic.id}`}
        defaults={{
          name: clinic.name,
          category: clinic.category,
          websiteUrl: clinic.websiteUrl,
          mainPhone: clinic.mainPhone,
          publicEmail: clinic.publicEmail,
          contactPageUrl: clinic.contactPageUrl,
          bookingMethod: clinic.bookingMethod,
          onlineBookingUrl: clinic.onlineBookingUrl,
          locationCount: clinic.locationCount,
          stage: clinic.stage,
          doNotContact: clinic.doNotContact,
          followUpDate: clinic.followUpDate?.toISOString().slice(0, 10) ?? null,
        }}
      />
    </div>
  );
}
