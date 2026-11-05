import { describe, expect, it } from "vitest";
import {
  hostOf,
  normalizePersonName,
  resolveIdentity,
  type KnownPerson,
} from "./identity";

describe("normalizePersonName", () => {
  it("drops honorifics and post-nominals", () => {
    expect(normalizePersonName("Dr. Sarah Chen")).toBe("sarah chen");
    expect(normalizePersonName("Sarah Chen, MD")).toBe("sarah chen");
    expect(normalizePersonName("Prof. Sarah Chen PhD")).toBe("sarah chen");
  });

  it("folds accents and punctuation", () => {
    expect(normalizePersonName("Michael O'Brien")).toBe(normalizePersonName("Michael OBrien"));
    expect(normalizePersonName("José Álvarez")).toBe("jose alvarez");
  });

  it("does not strip ordinary words the business normaliser would", () => {
    // normalizeName() in leads/dedupe removes "health", "medical", "group".
    // Doing that to a person's surname would silently merge them with others.
    expect(normalizePersonName("Sarah Health")).toBe("sarah health");
    expect(normalizePersonName("Ann Group")).toBe("ann group");
    expect(normalizePersonName("Sarah Health")).not.toBe(normalizePersonName("Sarah"));
  });

  it("handles empty input", () => {
    expect(normalizePersonName(null)).toBe("");
    expect(normalizePersonName("  ")).toBe("");
  });
});

describe("hostOf", () => {
  it("strips www and lowercases", () => {
    expect(hostOf("https://WWW.Riverbend.example/our-team")).toBe("riverbend.example");
  });

  it("returns null for anything unparseable", () => {
    expect(hostOf(null)).toBeNull();
    expect(hostOf("not a url")).toBeNull();
  });
});

const chen: KnownPerson = {
  id: "person-chen",
  normalizedName: "sarah chen",
  emails: ["s.chen@riverbend.example"],
  hosts: ["riverbend.example"],
};

describe("resolveIdentity", () => {
  it("matches on a shared published address even when the site differs", () => {
    const match = resolveIdentity(
      { normalizedName: "sarah chen", email: "S.Chen@Riverbend.example", host: "northgate.example" },
      [chen],
    );
    expect(match).toEqual({ personId: "person-chen", basis: "email" });
  });

  it("matches on a shared address even when the name is written differently", () => {
    // The address is the identifier here; "S Chen" alone would not be enough.
    const match = resolveIdentity(
      { normalizedName: "s chen", email: "s.chen@riverbend.example", host: "elsewhere.example" },
      [chen],
    );
    expect(match?.basis).toBe("email");
  });

  it("matches on name plus a site already associated with the person", () => {
    const match = resolveIdentity(
      { normalizedName: "sarah chen", email: null, host: "riverbend.example" },
      [chen],
    );
    expect(match).toEqual({ personId: "person-chen", basis: "name_and_host" });
  });

  it("REFUSES to merge on a name alone", () => {
    // The central safety property. Two Sarah Chens at unrelated clinics are
    // two people until something corroborates otherwise.
    const match = resolveIdentity(
      { normalizedName: "sarah chen", email: null, host: "northgate.example" },
      [chen],
    );
    expect(match).toBeNull();
  });

  it("refuses when the name matches and the address does not", () => {
    const match = resolveIdentity(
      { normalizedName: "sarah chen", email: "schen@northgate.example", host: "northgate.example" },
      [chen],
    );
    expect(match).toBeNull();
  });

  it("refuses when there is nothing to go on", () => {
    expect(resolveIdentity({ normalizedName: "", email: null, host: null }, [chen])).toBeNull();
    expect(
      resolveIdentity({ normalizedName: "sarah chen", email: null, host: null }, [chen]),
    ).toBeNull();
    expect(
      resolveIdentity({ normalizedName: "sarah chen", email: null, host: "x.example" }, []),
    ).toBeNull();
  });

  it("prefers the address match over a name-and-host match", () => {
    const other: KnownPerson = {
      id: "person-other",
      normalizedName: "sarah chen",
      emails: [],
      hosts: ["riverbend.example"],
    };
    // `other` would match on name+host; `chen` matches on the address, which
    // is the stronger basis and must win regardless of ordering.
    const match = resolveIdentity(
      { normalizedName: "sarah chen", email: "s.chen@riverbend.example", host: "riverbend.example" },
      [other, chen],
    );
    expect(match).toEqual({ personId: "person-chen", basis: "email" });
  });

  it("tolerates null emails and hosts stored against a person", () => {
    const sparse: KnownPerson = {
      id: "person-sparse",
      normalizedName: "sarah chen",
      emails: [null],
      hosts: [null],
    };
    expect(
      resolveIdentity({ normalizedName: "sarah chen", email: null, host: "a.example" }, [sparse]),
    ).toBeNull();
  });
});
