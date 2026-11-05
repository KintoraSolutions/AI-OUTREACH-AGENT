/**
 * Pre-launch cost estimation for a campaign's drafting run.
 *
 * Drafting is the only step with a per-lead price we can actually compute: one
 * model call per draftable lead, billed on input and output tokens. Discovery
 * (Google Places) and website fetching are billed by those providers under the
 * operator's own contract, so this module refuses to invent numbers for them —
 * `CampaignCostEstimate.unpricedSteps` names them instead.
 *
 * Everything here is pure so the figure shown before launch is unit-tested.
 */

export interface ModelPrice {
  /** USD per million input tokens. */
  inputPerMTok: number;
  /** USD per million output tokens. */
  outputPerMTok: number;
  label: string;
}

/**
 * Published list prices, USD per million tokens. Deliberately a lookup with no
 * default: an unrecognised model yields `priced: false` and the UI shows the
 * token counts without a dollar figure, rather than quoting a price that may be
 * wrong. Partner platforms (Bedrock, Vertex) bill separately and are not here.
 */
export const MODEL_PRICING: Record<string, ModelPrice> = {
  "claude-fable-5": { inputPerMTok: 10, outputPerMTok: 50, label: "Claude Fable 5" },
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25, label: "Claude Opus 5" },
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25, label: "Claude Opus 4.8" },
  "claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25, label: "Claude Opus 4.7" },
  "claude-opus-4-6": { inputPerMTok: 5, outputPerMTok: 25, label: "Claude Opus 4.6" },
  "claude-sonnet-5": { inputPerMTok: 3, outputPerMTok: 15, label: "Claude Sonnet 5" },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15, label: "Claude Sonnet 4.6" },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5, label: "Claude Haiku 4.5" },
};

/**
 * Characters per token for English prose with light markup. Anthropic's own
 * rule of thumb is roughly four; drafting prompts carry URLs, codes and
 * punctuation, which tokenize a little denser, so this leans slightly
 * conservative — the estimate should not read lower than the bill.
 */
export const CHARS_PER_TOKEN = 3.7;

/**
 * Share of the output ceiling a draft typically uses. Drafts are capped by
 * `AI_MAX_OUTPUT_TOKENS` but a 120-200 word email plus its claim map lands well
 * under that, so costing every draft at the ceiling would overstate the total
 * several times over. The ceiling is still reported as the worst case.
 */
export const TYPICAL_OUTPUT_RATIO = 0.6;

export function estimateTokensFromChars(chars: number): number {
  if (!Number.isFinite(chars) || chars <= 0) return 0;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export interface CostEstimateInput {
  /** Leads that will actually get a model call. */
  leadCount: number;
  model: string;
  /** Mean characters of system + user prompt, measured from real prompts. */
  avgPromptChars: number;
  /** The provider's configured `max_tokens` for one draft. */
  maxOutputTokens: number;
}

export interface CampaignCostEstimate {
  model: string;
  modelLabel: string;
  /** False when the model is not in `MODEL_PRICING`; callers must hide prices. */
  priced: boolean;
  leadCount: number;
  inputTokens: number;
  /** Expected output tokens, using `TYPICAL_OUTPUT_RATIO`. */
  outputTokens: number;
  /** Output tokens if every draft ran to the configured ceiling. */
  maxOutputTokens: number;
  inputUsd: number;
  outputUsd: number;
  totalUsd: number;
  /** Total if every draft hit the output ceiling. */
  maxTotalUsd: number;
  perLeadUsd: number;
  /** Steps with a real cost we cannot price from here. */
  unpricedSteps: string[];
}

/**
 * Estimate the cost of drafting `leadCount` emails.
 *
 * Returns zeroed totals rather than null for an empty campaign so the review
 * screen can still render the breakdown.
 */
export function estimateDraftingCost(input: CostEstimateInput): CampaignCostEstimate {
  const leadCount = Math.max(0, Math.floor(input.leadCount));
  const price = MODEL_PRICING[input.model];

  const perDraftInput = estimateTokensFromChars(input.avgPromptChars);
  const inputTokens = perDraftInput * leadCount;

  const ceiling = Math.max(0, Math.floor(input.maxOutputTokens));
  const perDraftOutput = Math.ceil(ceiling * TYPICAL_OUTPUT_RATIO);
  const outputTokens = perDraftOutput * leadCount;
  const maxOutput = ceiling * leadCount;

  const inputUsd = price ? (inputTokens / 1_000_000) * price.inputPerMTok : 0;
  const outputUsd = price ? (outputTokens / 1_000_000) * price.outputPerMTok : 0;
  const maxOutputUsd = price ? (maxOutput / 1_000_000) * price.outputPerMTok : 0;
  const totalUsd = inputUsd + outputUsd;

  return {
    model: input.model,
    modelLabel: price?.label ?? input.model,
    priced: Boolean(price),
    leadCount,
    inputTokens,
    outputTokens,
    maxOutputTokens: maxOutput,
    inputUsd,
    outputUsd,
    totalUsd,
    maxTotalUsd: inputUsd + maxOutputUsd,
    perLeadUsd: leadCount > 0 ? totalUsd / leadCount : 0,
    unpricedSteps: [],
  };
}

/**
 * Money for display. Sub-cent totals round up to $0.01 rather than to $0.00 —
 * showing "free" for a run that will be billed is the one rounding error worth
 * avoiding.
 */
export function formatUsd(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "$0.00";
  if (amount < 0.01) return "$0.01";
  if (amount < 1) return `$${amount.toFixed(2)}`;
  if (amount < 100) return `$${amount.toFixed(2)}`;
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/** Compact token count for the breakdown, e.g. "18.4k". */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  // Strip any trailing zeros, not just a whole ".00" — 2.50M should read 2.5M.
  return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
}

// ---------------------------------------------------------------------------
// Research cost
// ---------------------------------------------------------------------------

/**
 * Discovery is the only part of research that costs money.
 *
 * Page fetches are ordinary HTTP, and PageSpeed Insights is free within
 * Google's quota, so neither is priced here. Google Places is billed per call
 * against the operator's own Google Cloud account, which is why the free
 * allowance and the "your contract may differ" caveat travel with the number.
 *
 * Rates are Google's published list prices. The field mask this app requests
 * includes editorial summaries and phone numbers, which bill above the base
 * Text Search tier — so the higher SKU is used rather than the headline one,
 * on the principle that an estimate should not read lower than the invoice.
 */
export const PLACES_USD_PER_CALL = 0.04;
export const PLACES_FREE_CALLS_PER_MONTH = 5000;

/** Results per Places page, and the page cap the discovery provider applies. */
const PLACES_PAGE_SIZE = 20;
const PLACES_MAX_PAGES_PER_CATEGORY = 3;

/**
 * Number of `places:searchText` calls a fresh run will make.
 *
 * Mirrors `GooglePlacesDiscoveryProvider.discover`: one query per category,
 * paging until the over-fetch limit is reached, capped at three pages each.
 */
export function estimatePlacesCalls(categoryCount: number, maxLeads: number): number {
  const categories = Math.max(1, Math.floor(categoryCount));
  const leads = Math.max(1, Math.floor(maxLeads));
  // Mirrors runDiscovery's over-fetch so post-filtering still yields maxLeads.
  const fetchLimit = Math.min(Math.max(leads * 3, leads), 200);
  const pagesNeeded = Math.ceil(fetchLimit / PLACES_PAGE_SIZE);
  return Math.max(1, Math.min(categories * PLACES_MAX_PAGES_PER_CATEGORY, pagesNeeded));
}

export interface ResearchCostEstimate {
  /** Expected Places calls for this run. */
  calls: number;
  /** The most it could make, if every category pages to its cap. */
  maxCalls: number;
  usdPerCall: number;
  totalUsd: number;
  maxTotalUsd: number;
  freeCallsPerMonth: number;
}

export function estimateResearchCost(
  categoryCount: number,
  maxLeads: number,
): ResearchCostEstimate {
  const calls = estimatePlacesCalls(categoryCount, maxLeads);
  const maxCalls = Math.max(1, Math.floor(Math.max(1, categoryCount))) * PLACES_MAX_PAGES_PER_CATEGORY;
  return {
    calls,
    maxCalls: Math.max(calls, maxCalls),
    usdPerCall: PLACES_USD_PER_CALL,
    totalUsd: calls * PLACES_USD_PER_CALL,
    maxTotalUsd: Math.max(calls, maxCalls) * PLACES_USD_PER_CALL,
    freeCallsPerMonth: PLACES_FREE_CALLS_PER_MONTH,
  };
}
