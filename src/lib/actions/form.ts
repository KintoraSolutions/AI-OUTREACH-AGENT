import { ZodError } from "zod";

export type FieldErrors = Record<string, string[] | undefined>;

export interface FormState {
  ok: boolean;
  error?: string;
  fieldErrors?: FieldErrors;
  message?: string;
  /** Optional id of a created/updated resource, for client-side redirect. */
  resourceId?: string;
}

export const initialFormState: FormState = { ok: false };

export function fieldErrorsFromZod(error: ZodError): FieldErrors {
  return error.flatten().fieldErrors as FieldErrors;
}

export function fail(error: string): FormState {
  return { ok: false, error };
}
