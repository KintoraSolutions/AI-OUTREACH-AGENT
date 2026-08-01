import type { JobStepRunner } from "@/lib/research/types";

/**
 * A pass-through step runner: it simply invokes each step function once, with no
 * memoization. Used by the in-process `InlineJobRunner` and by the test suite,
 * where there is no durable replay to resume from. The Inngest runner supplies
 * its own adapter over `step.run` instead (see `src/inngest/functions.ts`).
 */
export const passthroughStepRunner: JobStepRunner = {
  run: (_id, fn) => fn(),
};
