import { describe, expect, it } from "vitest";
import { extractSiteInfo } from "@/lib/research/extract";

const BASE = "https://smilebrightdental.example";

describe("extractSiteInfo", () => {
  it("extracts public business email and phone from links", () => {
    const html = `
      <html><head><title>Smile Bright Dental</title>
      <meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body>
        <a href="mailto:hello@smilebright.example">Email us</a>
        <a href="tel:+1-416-555-0199">Call</a>
      </body></html>`;
    const info = extractSiteInfo(html, BASE);
    expect(info.title).toBe("Smile Bright Dental");
    expect(info.publicEmails).toContain("hello@smilebright.example");
    expect(info.phones[0]).toContain("416");
    expect(info.hasViewportMeta).toBe(true);
    expect(info.isHttps).toBe(true);
  });

  it("filters out asset-like and placeholder emails", () => {
    const html = `<a href="mailto:real@clinic.example">Real</a>
      <img src="logo@2x.png"> spacer@example.com`;
    const info = extractSiteInfo(html, BASE);
    expect(info.publicEmails).toContain("real@clinic.example");
    expect(info.publicEmails.some((e) => e.includes("example.com"))).toBe(false);
    expect(info.publicEmails.some((e) => e.includes("@2x"))).toBe(false);
  });

  it("detects an online booking platform and sets booking method", () => {
    const html = `<a href="https://myclinic.janeapp.com/book">Book online</a>`;
    const info = extractSiteInfo(html, BASE);
    expect(info.bookingPlatform).toBe("Jane");
    expect(info.onlineBookingUrl).toContain("janeapp.com");
    expect(info.bookingMethod).toBe("Online booking");
  });

  it("infers 'Contact form' when a form is present but no booking link", () => {
    const html = `<form><input name="email" /><input name="message" /></form>
      <a href="tel:5551234567">call</a>`;
    const info = extractSiteInfo(html, BASE);
    expect(info.hasContactForm).toBe(true);
    expect(info.bookingMethod).toBe("Contact form");
  });

  it("collects social links and the contact page", () => {
    const html = `
      <a href="https://facebook.com/smilebright">fb</a>
      <a href="https://instagram.com/smilebright">ig</a>
      <a href="/contact-us">Contact</a>`;
    const info = extractSiteInfo(html, BASE);
    expect(info.socialLinks.facebook).toContain("facebook.com");
    expect(info.socialLinks.instagram).toContain("instagram.com");
    expect(info.contactPageUrl).toBe(`${BASE}/contact-us`);
  });

  it("flags a missing viewport meta as not mobile-ready", () => {
    const info = extractSiteInfo("<html><body>no meta</body></html>", BASE);
    expect(info.hasViewportMeta).toBe(false);
  });

  it("extracts a street address as a location", () => {
    const html = `<p>Visit us at 123 Main Street, Suite 400, Toronto</p>`;
    const info = extractSiteInfo(html, BASE);
    expect(info.locations.length).toBeGreaterThan(0);
    expect(info.locations[0]!.address).toContain("Main Street");
  });

  it("marks http sites as not https", () => {
    const info = extractSiteInfo("<html></html>", "http://insecure.example");
    expect(info.isHttps).toBe(false);
  });
});
