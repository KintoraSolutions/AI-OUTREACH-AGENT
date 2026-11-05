import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

/**
 * Type is the native Microsoft stack — Segoe UI Variable for UI and Cascadia
 * for numerics — declared in globals.css rather than loaded through
 * next/font. On Windows these are the real brand faces, so the app renders in
 * Microsoft's own type instead of an approximation of it, and it ships no font
 * payload at all. Non-Windows clients fall through to the platform UI face,
 * which is what Microsoft's own web properties do.
 */

/**
 * Site metadata.
 *
 * The product is "Katalyst" everywhere else (landing page, brand mark,
 * sign-in); the title here used to read "Outreach Agent", which split the
 * brand across the public site and the browser tab.
 *
 * `metadataBase` resolves relative OG/Twitter URLs. It reads
 * NEXT_PUBLIC_SITE_URL so a deployment can declare its own origin, and falls
 * back to localhost for development rather than silently emitting relative
 * social URLs that crawlers cannot follow.
 */
const FALLBACK_SITE_URL = "http://localhost:3000";

/**
 * `new URL()` throws on anything that is not an absolute URL, and this module
 * is evaluated for every route, so a typo in NEXT_PUBLIC_SITE_URL (a bare
 * hostname, a trailing comment, an empty-but-present value) would take the
 * whole deployment down rather than degrade one social tag. Fall back instead.
 */
function resolveSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      // Keep the app serving; the only cost is relative social URLs.
    }
  }
  return new URL(FALLBACK_SITE_URL);
}

const SITE_URL = resolveSiteUrl();

const DESCRIPTION =
  "Katalyst is evidence-grounded clinic outreach for vendors and agencies selling to " +
  "healthcare clinics, and for providers seeking referral relationships. It researches " +
  "each clinic, scores it with a deterministic rule engine, and drafts an email in which " +
  "every claim maps to stored evidence. The draft lands in your own Gmail; Katalyst never sends.";

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: "Katalyst",
    template: "%s · Katalyst",
  },
  description: DESCRIPTION,
  applicationName: "Katalyst",
  openGraph: {
    type: "website",
    siteName: "Katalyst",
    title: "Katalyst",
    description: DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    // `summary`, not `summary_large_image`: no Open Graph image asset exists in
    // this repo, and a large-image card with no image renders as a blank slab.
    card: "summary",
    title: "Katalyst",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Sets the theme class before first paint. Must stay in <head> and
            must stay synchronous, or the page flashes the wrong palette. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
