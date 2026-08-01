/**
 * Build an RFC 2822 email message and base64url-encode it for the Gmail
 * `drafts.create` API (the `message.raw` field). Plain-text body only; headers
 * are minimally escaped. This produces a DRAFT payload only — it is never sent.
 */

export interface MimeMessageInput {
  to: string;
  toName?: string | null;
  from?: string | null;
  fromName?: string | null;
  subject: string;
  body: string;
}

/** Encode a header value that may contain non-ASCII using RFC 2047 when needed. */
function encodeHeader(value: string): string {
  // ASCII-only values pass through; otherwise use encoded-word (UTF-8, base64).
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const b64 = Buffer.from(value, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function formatAddress(email: string, name?: string | null): string {
  if (!name) return email;
  return `${encodeHeader(name)} <${email}>`;
}

export function buildMimeMessage(input: MimeMessageInput): string {
  // Normalize CRLF and strip header-injection newlines from header fields.
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const headers: string[] = [
    `To: ${formatAddress(clean(input.to), input.toName ? clean(input.toName) : null)}`,
  ];
  if (input.from) {
    headers.push(`From: ${formatAddress(clean(input.from), input.fromName ? clean(input.fromName) : null)}`);
  }
  headers.push(`Subject: ${encodeHeader(clean(input.subject))}`);
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push("Content-Transfer-Encoding: 7bit");

  const body = input.body.replace(/\r?\n/g, "\r\n");
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

/** URL-safe base64 with no padding, as Gmail's `raw` field requires. */
export function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function buildGmailRaw(input: MimeMessageInput): string {
  return toBase64Url(buildMimeMessage(input));
}
