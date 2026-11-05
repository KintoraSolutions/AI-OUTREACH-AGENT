import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

/**
 * Inngest serverless endpoint (docs/planning/build-plan.md Section 4). Inngest calls this route to
 * execute function steps. Requests are verified with the client's signing key
 * (from `INNGEST_SIGNING_KEY`) in production and are open to the local Dev Server
 * otherwise. This route is intentionally outside the auth middleware matcher.
 */
/**
 * Each Inngest step is a separate invocation of this route, so this bounds ONE
 * step, not a whole campaign. A single clinic step fetches a website and may
 * call PageSpeed, which comfortably exceeds the 10s serverless default and
 * would be killed mid-step.
 *
 * 60s is the ceiling on Vercel's Hobby plan; Pro allows up to 300 and raising
 * it here is safe if steps are still being cut short.
 */
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
