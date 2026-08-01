import { Role } from "@prisma/client";
import { requireOrgContext, roleAtLeast } from "@/lib/auth/rbac";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CsvImportForm } from "@/components/app/csv-import-form";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default async function ImportLeadsPage() {
  const ctx = await requireOrgContext();
  const canEdit = roleAtLeast(ctx.role, Role.MEMBER);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Import leads"
        description="Upload a CSV of clinics. Rows are validated and duplicates are skipped."
      />
      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <CsvImportForm />
          </CardContent>
        </Card>
      ) : (
        <Alert variant="warning">
          <AlertDescription>You have read-only access and cannot import leads.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
