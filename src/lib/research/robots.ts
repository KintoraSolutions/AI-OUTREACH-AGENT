/**
 * Minimal, dependency-free robots.txt parser and matcher.
 *
 * Compliance requirement (plan.md Section 6): the fetcher must obey robots.txt
 * disallow rules and crawl-delay, and must never bypass them. This implements
 * the common subset of the robots exclusion standard: user-agent groups,
 * Allow/Disallow with `*` and `$` wildcards, longest-match precedence, and
 * Crawl-delay. Unknown directives are ignored.
 */

interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; path: string }[];
  crawlDelay: number | null;
}

export interface RobotsRules {
  groups: RobotsGroup[];
}

export const RESEARCH_USER_AGENT =
  "HealthcareOutreachResearchBot (+contact via app owner; compliant public-business research)";

/** The short token matched against robots.txt user-agent lines. */
export const RESEARCH_UA_TOKEN = "healthcareoutreachresearchbot";

export function parseRobots(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!lastLineWasAgent || !current) {
        current = { agents: [], rules: [], crawlDelay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (!current) {
      current = { agents: ["*"], rules: [], crawlDelay: null };
      groups.push(current);
    }
    if (field === "disallow") {
      current.rules.push({ allow: false, path: value });
    } else if (field === "allow") {
      current.rules.push({ allow: true, path: value });
    } else if (field === "crawl-delay") {
      const n = Number(value);
      if (!Number.isNaN(n) && n >= 0) current.crawlDelay = n;
    }
  }
  return { groups };
}

function selectGroup(rules: RobotsRules, uaToken: string): RobotsGroup | null {
  let specific: RobotsGroup | null = null;
  let wildcard: RobotsGroup | null = null;
  for (const group of rules.groups) {
    for (const agent of group.agents) {
      if (agent === "*") wildcard = wildcard ?? group;
      else if (uaToken.includes(agent) || agent.includes(uaToken)) specific = specific ?? group;
    }
  }
  return specific ?? wildcard;
}

/** Convert a robots path pattern to a matcher supporting `*` and `$`. */
function pathMatches(pattern: string, path: string): boolean {
  if (pattern === "") return false; // empty Disallow == allow everything
  let regex = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "*") regex += ".*";
    else if (ch === "$" && i === pattern.length - 1) regex += "$";
    else regex += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  try {
    return new RegExp("^" + regex).test(path);
  } catch {
    return path.startsWith(pattern.replace(/[*$]/g, ""));
  }
}

export function isPathAllowed(
  rules: RobotsRules,
  path: string,
  uaToken: string = RESEARCH_UA_TOKEN,
): boolean {
  const group = selectGroup(rules, uaToken);
  if (!group) return true;
  // Longest matching rule wins; Allow beats Disallow on equal length.
  let best: { allow: boolean; len: number } | null = null;
  for (const rule of group.rules) {
    if (pathMatches(rule.path, path)) {
      const len = rule.path.length;
      if (!best || len > best.len || (len === best.len && rule.allow)) {
        best = { allow: rule.allow, len };
      }
    }
  }
  return best ? best.allow : true;
}

export function crawlDelaySeconds(
  rules: RobotsRules,
  uaToken: string = RESEARCH_UA_TOKEN,
): number | null {
  const group = selectGroup(rules, uaToken);
  return group?.crawlDelay ?? null;
}
