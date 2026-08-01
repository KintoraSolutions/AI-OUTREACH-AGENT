import { Role } from "@prisma/client";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/app/page-header";
import { CampaignForm } from "@/components/app/campaign-form";
import { ConfigWarning } from "@/components/app/config-warning";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createCampaign } from "@/app/(dashboard)/campaigns/actions";

export default async function NewCampaignPage() {
  const ctx = await requireOrgContext();
  const canEdit = roleAtLeast(ctx.role, Role.MEMBER);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New campaign"
        description="Define discovery criteria. You can save a campaign now and run research once discovery is configured."
      />
      <ConfigWarning providerKey="discovery" />
      {canEdit ? (
        <CampaignForm action={createCampaign} cancelHref="/campaigns" />
      ) : (
        <Alert variant="warning">
          <AlertDescription>
            You have read-only access. Ask an Admin to grant you member access to create campaigns.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
