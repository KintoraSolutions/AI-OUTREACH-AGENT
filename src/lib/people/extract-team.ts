import { classifyRole, type RoleClassification } from "@/lib/people/roles";

/**
 * Find the people a clinic publishes about itself, from the clinic's own site.
 *
 * Dependency-free and pure, matching `src/lib/research/extract.ts`: the signals
 * a team page carries are cheap to read with targeted parsing, and keeping it
 * pure is what makes it testable against fixtures instead of the live web.
 *
 * Scope, per docs/decisions/physician-outreach-data.md (D1): the clinic's own
 * public pages only. Nothing here reaches another site, and nothing infers a
 * value that was not printed. In particular an email address is only ever read
 * from a `mailto:` the clinic published; it is never assembled from a name.
 *
 * The bias throughout is to return nothing rather than something wrong. A team
 * page that cannot be parsed yields an empty list, which degrades to the
 * existing clinic-level outreach, and that is a correct outcome.
 */
export interface ExtractedPerson {
  fullName: string;
  /** Verbatim title as printed, when one was found adjacent to the name. */
  roleTitle: string | null;
  classification: RoleClassification | null;
  /** Only ever a published mailto:, never inferred. */
  email: string | null;
  /** The page this person was read from. */
  sourceUrl: string;
}

/** Link text or href fragments that mark a page listing the practice's people. */
const TEAM_PAGE_HINT =
  /(?:our[-\s]?(?:team|doctors|physicians|providers|practitioners|staff|dentists|optometrists)|meet[-\s]?(?:the[-\s]?)?(?:team|doctors|us)|\bteam\b|\bproviders\b|\bphysicians\b|\bdoctors\b|about[-\s]?us)/i;

/**
 * Words that disqualify a heading from being a person's name. Includes trade
 * and specialty words, because a clinic's own `<h1>` is the single most likely
 * false positive on the page: "Riverbend Family Optometry" otherwise parses as
 * a three-part capitalised name.
 */
const NOT_A_NAME =
  /\b(?:our|team|welcome|meet|about|services|service|contact|book|appointment|home|clinic|clinics|centre|center|practice|hours|location|insurance|new patients|faq|blog|news|privacy|terms|optometry|optical|dental|dentistry|medical|medicine|health|wellness|vision|chiropractic|physiotherapy|rehabilitation|associates|group|inc|ltd|llp|corp)\b/i;

/**
 * An honorific or post-nominal. Positive evidence that a heading names a
 * person rather than a thing.
 */
const PERSON_MARKER =
  /(?:^|\s)(?:Dr|Doctor|Prof)\.?\s|\b(?:M\.?D|D\.?O|O\.?D|D\.?D\.?S|D\.?M\.?D|D\.?C|R\.?M\.?T|Ph\.?D|F\.?R\.?C\.?P\.?C)\.?\b/;

/**
 * A person's name as a clinic prints it: an optional honorific, then two to
 * four capitalised parts, then optional credentials.
 */
const NAME =
  /^(?:(?:Dr|Doctor|Prof)\.?\s+)?((?:[A-Z][A-Za-z'’À-ɏ-]+)(?:\s+[A-Z][A-Za-z'’À-ɏ-]*\.?){1,3})(?:\s*,?\s*(?:M\.?D|D\.?O|O\.?D|D\.?D\.?S|D\.?M\.?D|D\.?C|R\.?M\.?T|B\.?Sc|Ph\.?D|M\.?Sc|F\.?R\.?C\.?P\.?C)\.?)*\s*$/;

const CREDENTIALS =
  /\b(?:M\.?D|D\.?O|O\.?D|D\.?D\.?S|D\.?M\.?D|D\.?C|Ph\.?D|F\.?R\.?C\.?P\.?C)\.?\b/i;

function stripTags(html: string): string {
  return html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
}

function decode(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&[a-z]+;/gi, " ");
}

function tidy(text: string): string {
  return decode(text).replace(/\s+/g, " ").trim();
}

/**
 * Candidate pages that list the practice's people, as absolute URLs on the
 * same host. Same-origin only: following a link off the clinic's own site
 * would exceed what D1 permits.
 */
export function findTeamPageUrls(html: string, baseUrl: string): string[] {
  let origin: URL;
  try {
    origin = new URL(baseUrl);
  } catch {
    return [];
  }

  const found = new Map<string, true>();
  const anchor = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchor)) {
    const href = match[1];
    const label = tidy(stripTags(match[2] ?? ""));
    if (!href) continue;

    let url: URL;
    try {
      url = new URL(href, origin);
    } catch {
      continue;
    }
    if (url.hostname !== origin.hostname) continue;
    if (!/^https?:$/.test(url.protocol)) continue;
    if (!TEAM_PAGE_HINT.test(url.pathname) && !TEAM_PAGE_HINT.test(label)) continue;

    url.hash = "";
    found.set(url.toString(), true);
    if (found.size >= 5) break;
  }

  return [...found.keys()];
}

/** True when a heading reads like a person rather than a section title. */
function looksLikeName(text: string): boolean {
  if (text.length < 4 || text.length > 70) return false;
  if (NOT_A_NAME.test(text)) return false;
  return NAME.test(text);
}

/** The person's name without honorific or trailing credentials. */
function cleanName(text: string): string | null {
  const match = NAME.exec(text);
  const captured = match?.[1];
  if (!captured) return null;
  return captured.replace(/\s+/g, " ").trim();
}

/**
 * Read the people from one page.
 *
 * The shape nearly every clinic team page shares is a repeated block with the
 * person's name in a heading and their title in the text immediately after it.
 * That adjacency is the whole heuristic: a heading that reads like a name, and
 * the short run of text that follows it before the next heading.
 */
export function extractTeam(html: string, pageUrl: string): ExtractedPerson[] {
  const people: ExtractedPerson[] = [];
  const seen = new Set<string>();

  const heading = /<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi;
  const matches = [...html.matchAll(heading)];

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i];
    if (!current) continue;

    const headingText = tidy(stripTags(current[2] ?? ""));
    if (!looksLikeName(headingText)) continue;

    const fullName = cleanName(headingText);
    if (!fullName) continue;

    const key = fullName.toLowerCase();
    if (seen.has(key)) continue;

    // The block between this heading and the next one is where the title and
    // any published address live. Bounded so a page without further headings
    // cannot drag in the whole footer.
    const start = (current.index ?? 0) + current[0].length;
    const next = matches[i + 1];
    const end = Math.min(next?.index ?? html.length, start + 1200);
    const block = html.slice(start, end);

    const roleTitle = findRoleTitle(block, headingText);
    const classification = classifyRole(roleTitle);

    // A heading whose nearby text names an excluded staff role is not someone
    // we pursue. classifyRole returns null both for that and for "no role
    // found", so distinguish the two: only skip when a title was found and
    // then rejected.
    if (roleTitle && !classification) continue;

    // With no classified role, keep the person only on positive evidence that
    // the heading names one. Without this a clinic's own heading parses as a
    // person and any general inbox beside it becomes their "personal"
    // address, which is considerably worse than finding nobody.
    if (!classification && !PERSON_MARKER.test(headingText)) continue;

    seen.add(key);
    people.push({
      fullName,
      roleTitle,
      classification,
      email: findPublishedEmail(block),
      sourceUrl: pageUrl,
    });
  }

  return people;
}

/**
 * The title printed near the name. Prefers a short standalone run of text,
 * which is how a title is almost always presented, over prose.
 */
function findRoleTitle(block: string, headingText: string): string | null {
  const candidates: string[] = [];

  // Text inside its own element directly after the heading.
  const element = /<(p|span|div|h[1-6]|li|em|strong)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const match of block.matchAll(element)) {
    const text = tidy(stripTags(match[2] ?? ""));
    if (text) candidates.push(text);
    if (candidates.length >= 6) break;
  }

  // Credentials sometimes sit on the heading itself: "Dr. Jane Smith, MD".
  if (CREDENTIALS.test(headingText)) candidates.unshift(headingText);

  for (const candidate of candidates) {
    if (candidate.length > 120) continue;
    // A sentence is a bio, not a title.
    if (/[.!?]\s+[A-Z]/.test(candidate)) continue;
    if (classifyRole(candidate)) return candidate;
    // Keep an excluded staff title so the caller can skip the person rather
    // than storing them with no role at all.
    if (/\b(?:receptionist|assistant|hygienist|student|resident|technician)\b/i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** An address the clinic published as a mailto:, or nothing. Never inferred. */
function findPublishedEmail(block: string): string | null {
  const mailto = /mailto:([^"'?\s>]+)/i.exec(block);
  const address = mailto?.[1];
  if (!address) return null;
  const decoded = decode(address).trim().toLowerCase();
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(decoded) ? decoded : null;
}
