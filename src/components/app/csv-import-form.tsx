"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/app/submit-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { importLeadsCsv } from "@/app/(dashboard)/leads/actions";
import { initialFormState, type FormState } from "@/lib/actions/form";

export function CsvImportForm() {
  const [state, formAction] = useActionState<FormState, FormData>(importLeadsCsv, initialFormState);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="file">CSV file</Label>
        <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
        <p className="text-xs text-muted-foreground">
          Recognized headers include: name, category, website, phone, email, address, contact name,
          contact title, contact email, booking method, contact page. Duplicates are skipped.
        </p>
      </div>

      <SubmitButton pendingText="Importing...">Import CSV</SubmitButton>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      {state.ok && state.message ? (
        <Alert variant="info">
          <AlertTitle>Import complete</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            {state.fieldErrors?.rows?.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {state.fieldErrors.rows.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
