import { Role } from "@prisma/client";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/app/page-header";
import { LeadForm } from "@/components/app/lead-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createLead } from "@/app/(dashboard)/leads/actions";

export default async function NewLeadPage() {
  const ctx = await requireOrgContext();
  const canEdit = roleAtLeast(ctx.role, Role.MEMBER);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="New lead" description="Add a healthcare clinic to your pipeline." />
      {canEdit ? (
        <LeadForm action={createLead} mode="create" cancelHref="/leads" />
      ) : (
        <Alert variant="warning">
          <AlertDescription>
            You have read-only access. Ask an Admin to grant you member access to create leads.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
