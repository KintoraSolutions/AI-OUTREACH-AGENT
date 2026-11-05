import { describe, expect, it } from "vitest";
import { DecisionRole } from "@prisma/client";
import { extractTeam, findTeamPageUrls } from "./extract-team";

const PAGE = "https://riverbendoptometry.ca/our-team";

const TEAM_PAGE = `
<!doctype html>
<html><body>
  <header><h1>Our Team</h1></header>
  <main>
    <section class="bio">
      <h3>Dr. Sarah Chen</h3>
      <p class="role">Founder &amp; Medical Director</p>
      <p>Dr. Chen has practised in London since 2004. She sees patients at all three locations.</p>
      <a href="mailto:s.chen@riverbendoptometry.ca">Email Dr. Chen</a>
    </section>
    <section class="bio">
      <h3>Dr. Michael O'Brien, OD</h3>
      <p class="role">Optometrist</p>
      <p>Michael joined the practice in 2019.</p>
    </section>
    <section class="bio">
      <h3>Priya Raman</h3>
      <p class="role">Practice Manager</p>
    </section>
    <section class="bio">
      <h3>Jenna Wallace</h3>
      <p class="role">Receptionist</p>
    </section>
  </main>
  <footer><h4>Contact Us</h4><p>Call 519-555-0142</p></footer>
</body></html>
`;

describe("extractTeam", () => {
  const people = extractTeam(TEAM_PAGE, PAGE);

  it("finds the people and not the section headings", () => {
    expect(people.map((p) => p.fullName)).toEqual([
      "Sarah Chen",
      "Michael O'Brien",
      "Priya Raman",
    ]);
  });

  it("drops the honorific and the credentials from the name", () => {
    expect(people.find((p) => p.fullName === "Michael O'Brien")).toBeDefined();
    expect(people.some((p) => p.fullName.includes("Dr."))).toBe(false);
    expect(people.some((p) => p.fullName.includes("OD"))).toBe(false);
  });

  it("excludes staff who are not decision makers", () => {
    // The receptionist is a real person on the page and must not become a lead.
    expect(people.some((p) => p.fullName === "Jenna Wallace")).toBe(false);
  });

  it("classifies the owner from the printed title", () => {
    const chen = people.find((p) => p.fullName === "Sarah Chen");
    expect(chen?.roleTitle).toBe("Founder & Medical Director");
    expect(chen?.classification?.role).toBe(DecisionRole.OWNER);
    expect(chen?.classification?.isOwner).toBe(true);
  });

  it("keeps an associate physician, but not as a decision maker", () => {
    const obrien = people.find((p) => p.fullName === "Michael O'Brien");
    expect(obrien?.classification?.role).toBe(DecisionRole.PHYSICIAN);
  });

  it("reads a published address and attributes it to the right person", () => {
    const chen = people.find((p) => p.fullName === "Sarah Chen");
    expect(chen?.email).toBe("s.chen@riverbendoptometry.ca");
    // The next person published no address, and one must never be carried over
    // from a neighbour or assembled from their name.
    expect(people.find((p) => p.fullName === "Michael O'Brien")?.email).toBeNull();
  });

  it("never infers an address from a name", () => {
    const html = `<h3>Dr. Sarah Chen</h3><p>Medical Director</p>`;
    const [person] = extractTeam(html, PAGE);
    expect(person?.email).toBeNull();
  });

  it("records the page each person was read from", () => {
    for (const person of people) expect(person.sourceUrl).toBe(PAGE);
  });

  it("does not treat prose as a job title", () => {
    const html = `
      <h3>Dr. Alan Reyes</h3>
      <p>Alan is a dedicated clinician. He leads our paediatric service.</p>`;
    const [person] = extractTeam(html, PAGE);
    expect(person?.fullName).toBe("Alan Reyes");
    expect(person?.roleTitle).toBeNull();
  });

  it("does not read the clinic's own name as a person", () => {
    // Regression. "Riverbend Family Optometry" is three capitalised words, so
    // it matched the name pattern, and the general inbox published beside it
    // was attached as that phantom person's address. Caught by the enrichment
    // test, pinned here.
    const html = `
      <h1>Riverbend Family Optometry</h1>
      <a href="mailto:info@riverbend.example">Email us</a>`;
    expect(extractTeam(html, PAGE)).toEqual([]);
  });

  it("keeps an untitled person only on an honorific or credentials", () => {
    // "Dr." is positive evidence of a person; a bare capitalised phrase is not.
    expect(extractTeam(`<h3>Dr. Alan Reyes</h3>`, PAGE)).toHaveLength(1);
    expect(extractTeam(`<h3>Alan Reyes, MD</h3>`, PAGE)).toHaveLength(1);
    expect(extractTeam(`<h3>Spring Garden Wellness</h3>`, PAGE)).toEqual([]);
    expect(extractTeam(`<h3>Northgate Eye Care</h3>`, PAGE)).toEqual([]);
  });

  it("returns nothing rather than guessing on an unparseable page", () => {
    expect(extractTeam("<html><body><div>Welcome</div></body></html>", PAGE)).toEqual([]);
    expect(extractTeam("", PAGE)).toEqual([]);
  });

  it("does not emit the same person twice", () => {
    const html = TEAM_PAGE + TEAM_PAGE;
    const names = extractTeam(html, PAGE).map((p) => p.fullName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("findTeamPageUrls", () => {
  const html = `
    <nav>
      <a href="/">Home</a>
      <a href="/our-team">Our Team</a>
      <a href="/about-us">About Us</a>
      <a href="/services">Services</a>
      <a href="https://www.facebook.com/riverbend/team">Follow our team</a>
      <a href="/our-team#chen">Dr. Chen</a>
    </nav>`;

  it("finds same-origin team pages", () => {
    const urls = findTeamPageUrls(html, "https://riverbendoptometry.ca/");
    expect(urls).toContain("https://riverbendoptometry.ca/our-team");
    expect(urls).toContain("https://riverbendoptometry.ca/about-us");
  });

  it("ignores unrelated pages", () => {
    const urls = findTeamPageUrls(html, "https://riverbendoptometry.ca/");
    expect(urls.some((u) => u.includes("/services"))).toBe(false);
  });

  it("never leaves the clinic's own host", () => {
    // D1 permits the clinic's own site. A social profile is a different site.
    const urls = findTeamPageUrls(html, "https://riverbendoptometry.ca/");
    expect(urls.some((u) => u.includes("facebook.com"))).toBe(false);
  });

  it("collapses fragments so one page is not fetched twice", () => {
    const urls = findTeamPageUrls(html, "https://riverbendoptometry.ca/");
    expect(urls.filter((u) => u.endsWith("/our-team"))).toHaveLength(1);
  });

  it("survives a malformed base URL", () => {
    expect(findTeamPageUrls(html, "not a url")).toEqual([]);
  });
});
