/**
 * Duplicate prevention helpers. A clinic's `dedupeKey` is a normalized composite
 * of its website domain, name, and primary address. Enforced by a DB unique
 * constraint per org, and used for soft matching in the UI/import.
 */

export function normalizeDomain(url: string | null | undefined): string {
  if (!url) return "";
  let value = url.trim().toLowerCase();
  if (!value) return "";
  if (!/^https?:\/\//.test(value)) value = `https://${value}`;
  try {
    const host = new URL(value).hostname;
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(clinic|centre|center|medical|health|group|inc|ltd|llc|the|and|of)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAddress(address: string | null | undefined): string {
  if (!address) return "";
  return address
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DedupeInput {
  name?: string | null;
  websiteUrl?: string | null;
  primaryAddress?: string | null;
}

/**
 * Builds a stable dedupe key. Prefers domain when present (strongest signal),
 * otherwise falls back to normalized name + address so entries without a
 * website still dedupe sensibly.
 */
export function computeDedupeKey({ name, websiteUrl, primaryAddress }: DedupeInput): string {
  const domain = normalizeDomain(websiteUrl);
  const cleanName = normalizeName(name);
  const cleanAddress = normalizeAddress(primaryAddress);

  if (domain) return `d:${domain}`;
  if (cleanName && cleanAddress) return `na:${cleanName}|${cleanAddress}`;
  if (cleanName) return `n:${cleanName}`;
  // Last resort: a random-ish key so unrelated blank records do not collide.
  return `x:${cleanAddress || Math.random().toString(36).slice(2)}`;
}
