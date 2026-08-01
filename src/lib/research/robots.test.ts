import { describe, expect, it } from "vitest";
import {
  crawlDelaySeconds,
  isPathAllowed,
  parseRobots,
  RESEARCH_UA_TOKEN,
} from "@/lib/research/robots";

describe("robots.txt parsing and matching", () => {
  it("allows everything when robots.txt is empty", () => {
    const rules = parseRobots("");
    expect(isPathAllowed(rules, "/anything")).toBe(true);
  });

  it("honors a wildcard Disallow", () => {
    const rules = parseRobots(["User-agent: *", "Disallow: /private"].join("\n"));
    expect(isPathAllowed(rules, "/private/data")).toBe(false);
    expect(isPathAllowed(rules, "/public")).toBe(true);
  });

  it("an empty Disallow value means allow all", () => {
    const rules = parseRobots(["User-agent: *", "Disallow:"].join("\n"));
    expect(isPathAllowed(rules, "/anything")).toBe(true);
  });

  it("gives Allow precedence via longest match", () => {
    const rules = parseRobots(
      ["User-agent: *", "Disallow: /folder", "Allow: /folder/public"].join("\n"),
    );
    expect(isPathAllowed(rules, "/folder/secret")).toBe(false);
    expect(isPathAllowed(rules, "/folder/public/page")).toBe(true);
  });

  it("supports $ end-anchors and * wildcards", () => {
    const rules = parseRobots(["User-agent: *", "Disallow: /*.pdf$"].join("\n"));
    expect(isPathAllowed(rules, "/files/report.pdf")).toBe(false);
    expect(isPathAllowed(rules, "/files/report.pdf?x=1")).toBe(true);
  });

  it("prefers a group that matches our user-agent over the wildcard group", () => {
    const rules = parseRobots(
      [
        "User-agent: *",
        "Disallow: /",
        `User-agent: ${RESEARCH_UA_TOKEN}`,
        "Disallow: /admin",
      ].join("\n"),
    );
    expect(isPathAllowed(rules, "/services")).toBe(true);
    expect(isPathAllowed(rules, "/admin")).toBe(false);
  });

  it("reads crawl-delay", () => {
    const rules = parseRobots(["User-agent: *", "Crawl-delay: 5"].join("\n"));
    expect(crawlDelaySeconds(rules)).toBe(5);
  });
});
