import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

/**
 * Inngest serverless endpoint (plan.md Section 4). Inngest calls this route to
 * execute function steps. Requests are verified with the client's signing key
 * (from `INNGEST_SIGNING_KEY`) in production and are open to the local Dev Server
 * otherwise. This route is intentionally outside the auth middleware matcher.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
