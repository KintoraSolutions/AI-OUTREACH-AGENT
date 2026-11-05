import Link from "next/link";
import { Archivo } from "next/font/google";
import { ArrowRight } from "lucide-react";
import { KatalystMark } from "@/components/brand/katalyst-mark";
import { Reveal } from "./reveal";
import { MobileNav } from "./mobile-nav";
import { ACCESS_CONTACT } from "./access";
import { LeadsPreview } from "./leads-preview";
import { FabricatedSentence, GuardDemo } from "./figures-guard";
import { DiscoverFigure, ResearchFigure, ScoreCard } from "./figures-run";
import { CampaignFigure, LaunchFigure, QueueFigure } from "./figures-campaign";
import {
  BRAND,
  CONTAINER,
  FG_2,
  FG_3,
  FG_4,
  INK,
  LINE,
  LINE_STRONG,
  R_SM,
  SCOPE,
  SECTION_PAD,
  SURFACE,
  SURFACE_2,
} from "./theme";

/* Industrial grotesque for display only, scoped to the marketing surface so it
   never enters the app bundle. The body face is the app's own Segoe stack. */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

/**
 * Public landing page.
 *
 * Rebuilt a second time, against a full audit of the product and of the page
 * that preceded it. Three findings drove the rewrite.
 *
 * 1. The page never named its customer. "You" appeared about fifteen times
 *    with no antecedent, and "Katalyst finds healthcare clinics" reads most
 *    naturally as a tool FOR clinics, which is the opposite of the truth: the
 *    operator is a company selling services TO clinics, or a provider
 *    introducing their practice to other providers. The audience is now the
 *    first line on the page.
 *
 * 2. The problem was never stated, so every claim had nothing to land against.
 *    There is now a problem section before the solution, and the fabricated
 *    sentence it shows is the same sentence the guard refuses two sections
 *    later, so the mechanism is recognised rather than asserted.
 *
 * 3. Structure came entirely from a hairline frame plus an uppercase mono
 *    kicker above every heading, and both were asked to go. They are gone, and
 *    what replaced them is deliberate: full-bleed ground planes that alternate
 *    so no two neighbours share a ground, a large and strictly invariant
 *    section rhythm, and three permitted layouts assigned by what a section
 *    IS. A ground change is a stronger boundary than a 1px rule, and unlike a
 *    hairline it survives at 375px.
 *
 * Also gone: the stat band (none of its three numbers was a measurement), the
 * 56px decorative grid, the 01/02/03 section indices, the standalone
 * "guarantee" band that restated "never sends" for the tenth time, the
 * autoplaying pipeline that kept 36% of the page's words behind a 4.2s timer,
 * and the claim that these panels are screenshots. They are not, and each one
 * now says so inside its own frame.
 */

/** Full-bleed ground plane. The ground is the section boundary. */
function Plane({
  id,
  ground,
  children,
  className,
}: {
  id?: string;
  ground: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} style={{ background: ground }}>
      <div className={`${CONTAINER} ${SECTION_PAD} ${className ?? ""}`}>{children}</div>
    </section>
  );
}

/** Section heading. No kicker, no index, no uppercase mono. */
function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="max-w-[16ch] text-[28px] font-bold leading-[1.1] tracking-[-0.022em] sm:max-w-[22ch] sm:text-[34px] lg:text-[38px]"
      style={{ fontFamily: "var(--font-archivo)" }}
    >
      {children}
    </h2>
  );
}

function Lede({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-5 max-w-[58ch] text-[17px] leading-[1.6]" style={{ color: FG_2 }}>
      {children}
    </p>
  );
}

/** One beat of the run. The number is real sequence, not decoration. */
function Beat({
  n,
  name,
  actor,
  line,
  children,
}: {
  n: string;
  name: string;
  actor: "Automatic" | "You";
  line: string;
  children: React.ReactNode;
}) {
  return (
    <Reveal className="pt-12 first:pt-0 sm:pt-16">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="font-mono text-[12px] tabular-nums"
          style={{ color: BRAND }}
        >
          {n}
        </span>
        <h3 className="text-[19px] font-semibold tracking-[-0.015em] text-white">{name}</h3>
        <span
          className="px-1.5 py-[2px] text-[11px]"
          style={{
            border: `1px solid ${actor === "You" ? "#0f548c" : LINE}`,
            borderRadius: R_SM,
            color: actor === "You" ? BRAND : FG_4,
          }}
        >
          {actor}
        </span>
      </div>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-[1.6]" style={{ color: FG_2 }}>
        {line}
      </p>
      <div className="mt-7">{children}</div>
    </Reveal>
  );
}

const NAV = [
  { label: "The problem", href: "#problem" },
  { label: "Safeguards", href: "#safeguards" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Access", href: "#access" },
];

const BLOCKED = [
  "A sentence with no finding behind it.",
  "A sentence resting on a finding someone dismissed.",
  "Protected health information in provider to provider outreach.",
  "A second email to a mailbox another lead already used.",
];

export function Landing() {
  return (
    <div
      className={`${archivo.variable} min-h-screen text-white`}
      style={{ background: INK, ...SCOPE }}
    >
      {/* If the reveal observer never runs, content must still be readable. */}
      <noscript>
        <style dangerouslySetInnerHTML={{ __html: ".mk-reveal{opacity:1;transform:none}" }} />
      </noscript>

      {/* ---- Header ------------------------------------------------------- */}
      <header
        className="sticky top-0 z-30"
        style={{
          background: "rgba(10,10,11,0.86)",
          backdropFilter: "blur(12px)",
          borderBottom: `1px solid ${LINE}`,
        }}
      >
        <div className={CONTAINER}>
          <div className="flex h-14 items-center justify-between gap-4">
            <Link href="/" className="flex shrink-0 items-center gap-2.5">
              <KatalystMark size={24} gradientId="kg-nav" />
              <span className="text-[16px] font-semibold tracking-[-0.02em]">Katalyst</span>
            </Link>

            <nav className="flex items-center gap-1 md:gap-6">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="hidden text-[13px] transition-colors hover:text-white md:inline"
                  style={{ color: FG_3 }}
                >
                  {item.label}
                </a>
              ))}
              <Link
                href="/signin"
                className="hidden h-9 items-center px-3.5 text-[13px] font-semibold text-black transition-[filter] hover:brightness-90 md:inline-flex"
                style={{ background: "#ffffff", borderRadius: R_SM }}
              >
                Sign in
              </Link>
              <MobileNav items={NAV} />
            </nav>
          </div>
        </div>
      </header>

      <main>
        {/* ---- Hero ------------------------------------------------------- */}
        <section style={{ background: INK }}>
          <div className={`${CONTAINER} pb-20 pt-12 sm:pb-28 sm:pt-14 lg:pb-36 lg:pt-16`}>
            <div className="grid gap-12 lg:grid-cols-[minmax(0,46%)_minmax(0,1fr)] lg:items-center lg:gap-10">
              <div>
                {/* The first line on the page names the reader. */}
                <p className="rise max-w-[46ch] text-[15px] leading-[1.6]" style={{ color: FG_3 }}>
                  For companies that sell services to healthcare clinics, and for providers
                  introducing their practice to other providers.
                </p>

                <h1
                  className="rise mt-5 text-[40px] font-bold leading-[1.03] tracking-[-0.032em] sm:text-[52px] lg:text-[46px] xl:text-[56px]"
                  style={{ fontFamily: "var(--font-archivo)", animationDelay: "70ms" }}
                >
                  Clinic outreach where every claim has a source.
                </h1>

                <p
                  className="rise mt-6 max-w-[54ch] text-[17px] leading-[1.6]"
                  style={{ color: FG_2, animationDelay: "150ms" }}
                >
                  Katalyst reads each clinic&rsquo;s public website, scores it with rules you can
                  open, and writes an email that cites the evidence behind every factual sentence.
                  Approving a draft creates it in your own Gmail, where you press send.
                </p>

                <div
                  className="rise mt-8 flex flex-wrap items-center gap-2.5"
                  style={{ animationDelay: "220ms" }}
                >
                  <Link
                    href="/signin"
                    className="inline-flex h-11 items-center gap-2 px-5 text-[15px] font-semibold text-black transition-[filter] hover:brightness-90"
                    style={{ background: "#ffffff", borderRadius: R_SM }}
                  >
                    Sign in <ArrowRight aria-hidden className="size-4" />
                  </Link>
                  <a
                    href="#how-it-works"
                    className="inline-flex h-11 items-center px-4 text-[15px] transition-colors hover:text-white"
                    style={{
                      border: `1px solid ${LINE_STRONG}`,
                      borderRadius: R_SM,
                      color: FG_2,
                    }}
                  >
                    See how it works
                  </a>
                </div>

                <p
                  className="rise mt-4 text-[12.5px]"
                  style={{ color: FG_4, animationDelay: "280ms" }}
                >
                  Access is limited to approved accounts.
                </p>
              </div>

              {/* The workspace, clipped by the viewport: the software continues. */}
              <div
                className="rise min-w-0 lg:w-[calc(100%+9rem)]"
                style={{ animationDelay: "360ms" }}
              >
                <LeadsPreview />
              </div>
            </div>
          </div>
        </section>

        {/* ---- Problem ---------------------------------------------------- */}
        <Plane id="problem" ground={SURFACE}>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,46%)_minmax(0,1fr)] lg:items-center">
            <Reveal>
              <H2>Two ways clinic outreach goes wrong</H2>
              <div className="mt-7">
                <p className="max-w-[52ch] text-[15px] leading-[1.6]" style={{ color: FG_2 }}>
                  Researching clinics one at a time is slow, so most teams stop at a name and a
                  phone number and send everyone the same email.
                </p>
                <p
                  className="mt-5 max-w-[52ch] border-t pt-5 text-[15px] leading-[1.6]"
                  style={{ borderColor: LINE, color: FG_2 }}
                >
                  Tools that write the email for you are faster, and they invent details the clinic
                  can disprove from its own website.
                </p>
              </div>
            </Reveal>
            <Reveal delay={120} className="min-w-0">
              <FabricatedSentence />
            </Reveal>
          </div>
        </Plane>

        {/* ---- Safeguards ------------------------------------------------- */}
        <Plane id="safeguards" ground={INK}>
          <Reveal>
            <H2>Every factual sentence points at a finding</H2>
            <Lede>
              A finding is a fact Katalyst read on a clinic&rsquo;s public website, stored with the
              page it came from and a confidence level. When the research turns up nothing citable,
              the model is never called at all.
            </Lede>
          </Reveal>

          <div className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,46%)] lg:items-center">
            <Reveal delay={100} className="min-w-0 lg:order-2">
              <GuardDemo />
            </Reveal>
            <Reveal delay={160} className="lg:order-1">
              <p className="text-[15px] font-semibold text-white">Blocked before anyone can approve it</p>
              <ul className="mt-4">
                {BLOCKED.map((line, i) => (
                  <li
                    key={line}
                    className="py-3.5 text-[15px] leading-[1.55]"
                    style={{
                      borderTop: i === 0 ? "none" : `1px solid ${LINE}`,
                      color: FG_2,
                    }}
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </Plane>

        {/* ---- How it starts ---------------------------------------------- */}
        <Plane id="start" ground={SURFACE}>
          <Reveal>
            <H2>What you set up before the first campaign</H2>
            <Lede>
              You describe your company, what you offer, how your emails should sound, and who
              signs them. Then you pick the use case: selling a service to clinics, or introducing
              your own practice to other providers.
            </Lede>
            <p className="mt-5 max-w-[58ch] text-[15px] leading-[1.6]" style={{ color: FG_3 }}>
              A campaign sets categories, a city and radius, a lead cap, and keywords. Every lead
              comes from a Google Places search inside that area, and a lead is one clinic with its
              research and score attached.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-8 lg:grid-cols-2 lg:items-start">
            <Reveal delay={100} className="min-w-0">
              <CampaignFigure />
            </Reveal>
            <Reveal delay={180} className="min-w-0">
              <LaunchFigure />
            </Reveal>
          </div>
        </Plane>

        {/* ---- The run ---------------------------------------------------- */}
        <Plane id="how-it-works" ground={INK}>
          <Reveal>
            <H2>One clinic, from map result to Gmail draft</H2>
            <Lede>
              Discovery, research and scoring run on their own. You trigger the draft, and an admin
              approves it. Nothing below moves on a timer, so you can read a stage for as long as
              you want.
            </Lede>
          </Reveal>

          <div className="mt-4">
            <Beat
              n="01"
              name="Discover"
              actor="Automatic"
              line="Katalyst searches Google Places in your categories and area, then filters and de-duplicates the results."
            >
              <DiscoverFigure />
            </Beat>

            <Beat
              n="02"
              name="Research"
              actor="Automatic"
              line="A crawl that respects robots rules reads the public site. Each fact is stored with the page it came from."
            >
              <ResearchFigure />
            </Beat>

            <Beat
              n="03"
              name="Score"
              actor="Automatic"
              line="Named rules turn the findings into a score. The same findings always produce the same score, and every point names the rule behind it."
            >
              <ScoreCard />
              <p className="mt-4 max-w-[62ch] text-[13px] leading-[1.6]" style={{ color: FG_3 }}>
                The five categories are website, custom software, phone operations,
                contactability and business fit. Weak evidence earns fewer points than a verified
                fact, so an assumption can never score like one.
              </p>
            </Beat>

            <Beat
              n="04"
              name="Review and approve"
              actor="You"
              line="Approval needs an admin, a blocked draft cannot be approved at all, and approving creates the email in your Gmail drafts."
            >
              <QueueFigure />
            </Beat>
          </div>
        </Plane>

        {/* ---- Outcome ---------------------------------------------------- */}
        <Plane id="outcome" ground={SURFACE}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,46%)_minmax(0,1fr)]">
            <Reveal>
              <H2>What you have when a run finishes</H2>
            </Reveal>
            <Reveal delay={100}>
              <p className="max-w-[58ch] text-[17px] leading-[1.6]" style={{ color: FG_2 }}>
                A ranked list of clinics, where each score opens onto the rules and findings behind
                it. Every draft keeps its earlier versions with who changed them and why, and a
                score override carries a written reason on a log nobody can edit or delete.
              </p>
              <p className="mt-6 max-w-[58ch] text-[13.5px] leading-[1.65]" style={{ color: FG_3 }}>
                An org admin sets the scoring weights. Katalyst asks Google only for the scopes it
                needs, and contacting the same mailbox twice through two leads is blocked.
              </p>
            </Reveal>
          </div>
        </Plane>

        {/* ---- Access ----------------------------------------------------- */}
        <Plane id="access" ground={SURFACE_2} className="text-center">
          <Reveal className="mx-auto max-w-[34ch]">
            <h2
              className="text-[32px] font-semibold leading-[1.08] tracking-[-0.026em] sm:text-[42px] lg:text-[48px]"
              style={{ fontFamily: "var(--font-archivo)" }}
            >
              Access is by invitation.
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <p
              className="mx-auto mt-6 max-w-[56ch] text-[15.5px] leading-[1.65]"
              style={{ color: FG_3 }}
            >
              Katalyst signs in with Google against an approved list. If your address is not on it,
              an owner has to add you.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              {ACCESS_CONTACT ? (
                <a
                  href={`mailto:${ACCESS_CONTACT}?subject=Katalyst%20access%20request`}
                  className="inline-flex h-11 items-center gap-2 px-6 text-[15px] font-semibold text-black transition-[filter] hover:brightness-90"
                  style={{ background: "#ffffff", borderRadius: R_SM }}
                >
                  Request access <ArrowRight aria-hidden className="size-4" />
                </a>
              ) : null}
              <Link
                href="/signin"
                className={
                  ACCESS_CONTACT
                    ? "inline-flex h-11 items-center px-4 text-[15px] transition-colors hover:text-white"
                    : "inline-flex h-11 items-center gap-2 px-6 text-[15px] font-semibold text-black transition-[filter] hover:brightness-90"
                }
                style={
                  ACCESS_CONTACT
                    ? { border: `1px solid ${LINE_STRONG}`, borderRadius: R_SM, color: FG_2 }
                    : { background: "#ffffff", borderRadius: R_SM }
                }
              >
                Sign in
                {ACCESS_CONTACT ? null : <ArrowRight aria-hidden className="size-4" />}
              </Link>
            </div>
          </Reveal>
        </Plane>
      </main>

      <footer style={{ background: INK, borderTop: `1px solid ${LINE}` }}>
        <div className={`${CONTAINER} py-10`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2.5">
              <KatalystMark size={20} gradientId="kg-foot" />
              <span className="text-[14px] font-semibold">Katalyst</span>
              <span className="text-[12.5px]" style={{ color: FG_4 }}>
                Lead research and outreach for healthcare.
              </span>
            </div>
            <p
              className="max-w-md text-[11.5px] leading-relaxed sm:text-right"
              style={{ color: FG_4 }}
            >
              You are responsible for ensuring outreach complies with the laws that apply to you
              and your recipients.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
