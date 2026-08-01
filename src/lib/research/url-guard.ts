import { NonRecoverableError } from "@/lib/research/errors";

/**
 * SSRF / target-safety guard. The fetcher must never be pointed at internal
 * infrastructure or non-web schemes. This is a best-effort, hostname-level
 * guard (it does not resolve DNS); it blocks localhost, private/reserved IP
 * literals, and non-http(s) schemes. DNS-rebind protection would require
 * resolving and pinning the IP, which is documented as a future hardening step.
 */

const PRIVATE_IPV4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.)/;

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  // IPv4 literal in a private/reserved range.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && PRIVATE_IPV4.test(host)) return true;
  // IPv6 unique-local / link-local literals.
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  // No dot and not an IP -> not a public FQDN (e.g. "intranet").
  if (!host.includes(".") && !/^\d/.test(host)) return true;
  return false;
}

/** Returns a normalized absolute URL if safe, otherwise throws. */
export function assertSafeUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new NonRecoverableError("invalid_url", `Not a valid URL: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new NonRecoverableError("unsafe_url", `Blocked non-web scheme: ${url.protocol}`);
  }
  if (isBlockedHostname(url.hostname)) {
    throw new NonRecoverableError("unsafe_url", `Blocked non-public host: ${url.hostname}`);
  }
  return url;
}

export function isSafeUrl(rawUrl: string): boolean {
  try {
    assertSafeUrl(rawUrl);
    return true;
  } catch {
    return false;
  }
}

/** Normalize a possibly-schemeless URL to an https absolute form. */
export function toAbsoluteUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    return null;
  }
}
