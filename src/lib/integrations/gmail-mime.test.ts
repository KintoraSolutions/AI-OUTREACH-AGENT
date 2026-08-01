import { describe, expect, it } from "vitest";
import { buildMimeMessage, buildGmailRaw, toBase64Url } from "@/lib/integrations/gmail-mime";

function decode(b64url: string): string {
  return Buffer.from(b64url, "base64url").toString("utf8");
}

describe("gmail MIME builder", () => {
  it("builds a well-formed plain-text message", () => {
    const msg = buildMimeMessage({
      to: "owner@clinic.example",
      toName: "Dr. Rivera",
      from: "me@agency.example",
      fromName: "Sender One",
      subject: "A quick note",
      body: "Hello there.\nSecond line.",
    });
    expect(msg).toContain("To: Dr. Rivera <owner@clinic.example>");
    expect(msg).toContain("From: Sender One <me@agency.example>");
    expect(msg).toContain("Subject: A quick note");
    expect(msg).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(msg).toContain("Hello there.\r\nSecond line.");
  });

  it("strips header-injection newlines from header fields", () => {
    const msg = buildMimeMessage({
      to: "owner@clinic.example",
      subject: "Hi\r\nBcc: victim@evil.example",
      body: "body",
    });
    // The injected header must not appear on its own line.
    expect(msg).not.toMatch(/\r\nBcc: victim@evil\.example/);
    expect(msg).toContain("Subject: Hi Bcc: victim@evil.example");
  });

  it("RFC 2047-encodes non-ASCII header values", () => {
    const msg = buildMimeMessage({
      to: "owner@clinic.example",
      toName: "Café Clinic",
      subject: "Regime santé",
      body: "b",
    });
    expect(msg).toContain("=?UTF-8?B?");
  });

  it("produces url-safe base64 with no padding", () => {
    const raw = buildGmailRaw({ to: "a@b.example", subject: "s", body: "b" });
    expect(raw).not.toContain("+");
    expect(raw).not.toContain("/");
    expect(raw).not.toContain("=");
    expect(decode(raw)).toContain("To: a@b.example");
  });

  it("toBase64Url round-trips", () => {
    expect(decode(toBase64Url("hello"))).toBe("hello");
  });
});
