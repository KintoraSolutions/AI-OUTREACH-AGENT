import type { ExtractedLocation, ExtractedSiteInfo } from "@/lib/research/types";

/**
 * Dependency-free extraction of *public business* information from a clinic's
 * own website HTML. We deliberately avoid a heavy DOM library: the signals we
 * need (contact email/phone, booking method, social links, service names,
 * viewport/HTTPS) are cheap to read with targeted parsing, and this keeps the
 * step pure and easy to unit-test.
 *
 * Compliance (docs/planning/build-plan.md Section 6): only business-contact and marketing content
 * presented on the clinic's public site is read. No patient data, no health
 * records, and nothing from gated/authenticated pages is collected.
 */

const KNOWN_BOOKING_PLATFORMS: { host: string; label: string }[] = [
  { host: "janeapp.com", label: "Jane" },
  { host: "jane.app", label: "Jane" },
  { host: "acuityscheduling.com", label: "Acuity" },
  { host: "squareup.com", label: "Square Appointments" },
  { host: "calendly.com", label: "Calendly" },
  { host: "setmore.com", label: "Setmore" },
  { host: "zocdoc.com", label: "Zocdoc" },
  { host: "cliniko.com", label: "Cliniko" },
  { host: "healthengine.com", label: "HealthEngine" },
  { host: "mindbodyonline.com", label: "Mindbody" },
  { host: "simplepractice.com", label: "SimplePractice" },
  { host: "picktime.com", label: "Picktime" },
];

const SOCIAL_HOSTS: { host: string; key: string }[] = [
  { host: "facebook.com", key: "facebook" },
  { host: "instagram.com", key: "instagram" },
  { host: "linkedin.com", key: "linkedin" },
  { host: "twitter.com", key: "twitter" },
  { host: "x.com", key: "twitter" },
  { host: "youtube.com", key: "youtube" },
  { host: "tiktok.com", key: "tiktok" },
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
// Junk emails that are placeholders or asset filenames, not business contacts.
const EMAIL_BLOCKLIST = /(example\.(com|org)|sentry\.io|\.png|\.jpg|\.jpeg|\.gif|\.webp|@2x)/i;
const PHONE_RE =
  /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{2,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/g;

const SERVICE_KEYWORDS = [
  "physiotherapy", "physio", "chiropractic", "massage therapy", "acupuncture",
  "orthodontics", "dental", "dentistry", "optometry", "ophthalmology",
  "dermatology", "podiatry", "audiology", "counselling", "psychology",
  "rehabilitation", "sports medicine", "pediatrics", "family medicine",
  "walk-in", "vaccination", "physical therapy", "naturopathy", "orthotics",
];

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function collectHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) hrefs.push(decodeEntities(m[1]!.trim()));
  return hrefs;
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizePhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

export function extractSiteInfo(html: string, baseUrl: string): ExtractedSiteInfo {
  const lower = html.toLowerCase();
  const hrefs = collectHrefs(html);

  // --- Emails (mailto: first, then body text) ---
  const emails = new Map<string, string>();
  for (const href of hrefs) {
    if (href.toLowerCase().startsWith("mailto:")) {
      const addr = href.slice(7).split("?")[0]!.trim().toLowerCase();
      if (addr && !EMAIL_BLOCKLIST.test(addr)) emails.set(addr, addr);
    }
  }
  for (const match of html.match(EMAIL_RE) ?? []) {
    const addr = match.toLowerCase();
    if (!EMAIL_BLOCKLIST.test(addr)) emails.set(addr, addr);
  }

  // --- Phones (tel: links are the most reliable) ---
  const phones = new Map<string, string>();
  for (const href of hrefs) {
    if (href.toLowerCase().startsWith("tel:")) {
      const raw = decodeEntities(href.slice(4).trim());
      const norm = normalizePhone(raw);
      if (norm.length >= 7) phones.set(norm, raw);
    }
  }
  if (phones.size === 0) {
    for (const match of html.replace(/<[^>]+>/g, " ").match(PHONE_RE) ?? []) {
      const norm = normalizePhone(match);
      if (norm.length >= 9 && norm.length <= 15) phones.set(norm, match.trim());
      if (phones.size >= 5) break;
    }
  }

  // --- Social + booking + contact links ---
  const socialLinks: Record<string, string> = {};
  let onlineBookingUrl: string | null = null;
  let contactPageUrl: string | null = null;
  const bookingPlatformSet = new Set<string>();
  let hasDownloadableForms = false;
  const baseHost = hostOf(baseUrl);

  for (const href of hrefs) {
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    const abs = resolveUrl(href, baseUrl);
    if (!abs) continue;
    const h = hostOf(abs);
    const hrefLower = href.toLowerCase();

    for (const s of SOCIAL_HOSTS) {
      if ((h === s.host || h.endsWith(`.${s.host}`)) && !socialLinks[s.key]) {
        socialLinks[s.key] = abs;
      }
    }
    const platform = KNOWN_BOOKING_PLATFORMS.find(
      (p) => h === p.host || h.endsWith(`.${p.host}`),
    );
    if (platform) {
      bookingPlatformSet.add(platform.label);
      if (!onlineBookingUrl) onlineBookingUrl = abs;
    }
    if (!onlineBookingUrl && /(book|appointment|schedul)/.test(hrefLower)) {
      onlineBookingUrl = abs;
    }
    if (!contactPageUrl && h === baseHost && /contact/.test(hrefLower)) {
      contactPageUrl = abs;
    }
    // Downloadable/printable intake or referral forms (a manual-workflow signal).
    if (
      /\.pdf($|\?)/.test(hrefLower) &&
      /(intake|referral|new[-\s]?patient|form|registration|consent)/.test(hrefLower)
    ) {
      hasDownloadableForms = true;
    }
  }
  const bookingPlatforms = [...bookingPlatformSet];
  const bookingPlatform = bookingPlatforms[0] ?? null;

  // --- Booking method inference ---
  const hasContactForm = /<form\b/i.test(html) && /(contact|message|enquir|inquir|name|email)/i.test(lower);
  let bookingMethod: string | null = null;
  if (onlineBookingUrl || bookingPlatform) bookingMethod = "Online booking";
  else if (hasContactForm) bookingMethod = "Contact form";
  else if (phones.size > 0) bookingMethod = "Call to book";

  // --- Services ---
  const services = SERVICE_KEYWORDS.filter((k) => lower.includes(k))
    .map((k) => k.replace(/\b\w/g, (c) => c.toUpperCase()))
    .slice(0, 12);

  // --- Meta / tech signals ---
  const hasViewportMeta = /<meta[^>]+name=["']viewport["']/i.test(html);
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]!.trim()).slice(0, 300) : null;
  const descMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]*\bcontent=["']([^"']*)["']/i,
  );
  const metaDescription = descMatch ? decodeEntities(descMatch[1]!.trim()).slice(0, 400) : null;
  const isHttps = baseUrl.toLowerCase().startsWith("https://");

  // --- Workflow / structure signals ---
  const mentionsReferral = /\breferral(s)?\b/.test(lower);
  const mentionsDepartments = /\bdepartment(s)?\b/.test(lower);

  // --- Locations (best-effort: addresses in the markup) ---
  const locations = extractLocations(html);

  return {
    title,
    metaDescription,
    publicEmails: [...emails.values()].slice(0, 10),
    phones: [...phones.values()].slice(0, 10),
    contactPageUrl,
    onlineBookingUrl,
    bookingMethod,
    socialLinks,
    services,
    locations,
    hasViewportMeta,
    hasContactForm,
    isHttps,
    bookingPlatform,
    bookingPlatforms,
    hasDownloadableForms,
    mentionsReferral,
    mentionsDepartments,
    linkCount: hrefs.length,
  };
}

const ADDRESS_RE =
  /\b\d{1,6}\s+[A-Za-z0-9.\s]{2,40}\b(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|suite|ste|unit|highway|hwy|place|pl|court|ct)\b[^<\n]{0,60}/gi;

function extractLocations(html: string): ExtractedLocation[] {
  const text = decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  const seen = new Set<string>();
  const out: ExtractedLocation[] = [];
  for (const match of text.match(ADDRESS_RE) ?? []) {
    const address = match.trim().replace(/\s+/g, " ").slice(0, 160);
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: null, address, phone: null });
    if (out.length >= 10) break;
  }
  return out;
}

export const _internal = { KNOWN_BOOKING_PLATFORMS, SOCIAL_HOSTS };
