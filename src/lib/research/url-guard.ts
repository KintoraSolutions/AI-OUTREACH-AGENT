import { lookup } from "node:dns/promises";
import { NonRecoverableError } from "@/lib/research/errors";

/**
 * SSRF / target-safety guard. The fetcher must never be pointed at internal
 * infrastructure or non-web schemes.
 *
 * Two layers:
 *  - `assertSafeUrl` (sync): scheme + lexical hostname checks (localhost,
 *    private/reserved IP literals, non-FQDNs). Fast, no I/O.
 *  - `assertSafeUrlResolved` (async): the authoritative check used before every
 *    network hop. It additionally RESOLVES DNS and rejects the request if ANY
 *    resolved address is private/reserved/loopback/link-local, so hostnames that
 *    point at internal space (e.g. `metadata.google.internal`, `*.nip.io`, or a
 *    CNAME into RFC-1918) cannot be reached. The fetcher validates every redirect
 *    hop with this, so a public site cannot redirect the crawler inward.
 */

const PRIVATE_IPV4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * True when a resolved IP address (IPv4, IPv6, or IPv4-mapped IPv6) is in a
 * private, reserved, loopback, link-local, unique-local, multicast, or otherwise
 * non-public range.
 */
export function isBlockedIp(addr: string): boolean {
  let a = addr.toLowerCase().trim();
  // Strip zone id (e.g. fe80::1%eth0) and IPv4-mapped IPv6 prefix.
  a = a.replace(/%.*$/, "");
  const mapped = a.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) a = mapped[1]!;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) {
    if (PRIVATE_IPV4.test(a)) return true;
    const first = Number(a.split(".")[0]);
    // 0.0.0.0/8 (this network), 224.0.0.0/4 (multicast), 240.0.0.0/4 (reserved).
    if (first === 0 || first >= 224) return true;
    if (a === "255.255.255.255") return true;
    return false;
  }

  // IPv6
  if (a === "::1" || a === "::") return true; // loopback / unspecified
  if (a.startsWith("fc") || a.startsWith("fd")) return true; // unique-local fc00::/7
  if (a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb")) {
    return true; // link-local fe80::/10
  }
  if (a.startsWith("ff")) return true; // multicast ff00::/8
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  // IPv4 literal in a private/reserved range.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && isBlockedIp(host)) return true;
  // IPv6 unique-local / link-local literals.
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  // No dot and not an IP -> not a public FQDN (e.g. "intranet").
  if (!host.includes(".") && !/^\d/.test(host)) return true;
  return false;
}

/** Returns a normalized absolute URL if safe (sync/lexical), otherwise throws. */
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

/**
 * Authoritative SSRF check: the lexical checks PLUS a DNS resolution that
 * rejects the request if the hostname resolves to any internal address. Call
 * this before issuing a request to `rawUrl` (including each redirect hop).
 */
export async function assertSafeUrlResolved(rawUrl: string): Promise<URL> {
  const url = assertSafeUrl(rawUrl);
  let addresses: { address: string }[];
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new NonRecoverableError("unsafe_url", `Could not resolve host: ${url.hostname}`);
  }
  if (addresses.length === 0) {
    throw new NonRecoverableError("unsafe_url", `Host did not resolve: ${url.hostname}`);
  }
  for (const { address } of addresses) {
    if (isBlockedIp(address)) {
      throw new NonRecoverableError(
        "unsafe_url",
        `Blocked internal address for host ${url.hostname}.`,
      );
    }
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
