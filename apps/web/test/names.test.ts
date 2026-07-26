import { describe, expect, it } from "vitest";
import { numberedName, suggestName } from "../src/lib/names.js";

const year = new Date().getFullYear();

describe("naming a tournament", () => {
  it("stamps the year, so next season's is a different tournament", () => {
    expect(numberedName("Spring Cup")).toBe(`Spring Cup ${year}`);
  });

  it("numbers a name already in use", () => {
    expect(numberedName("Spring Cup", [`Spring Cup ${year}`])).toBe(`Spring Cup ${year} #2`);
    expect(
      numberedName("Spring Cup", [`Spring Cup ${year}`, `Spring Cup ${year} #2`]),
    ).toBe(`Spring Cup ${year} #3`);
  });

  it("does not care about capitalisation or stray spaces when comparing", () => {
    expect(numberedName("Spring Cup", [`  spring cup ${year}  `])).toBe(`Spring Cup ${year} #2`);
  });

  it("leaves a name alone when nothing clashes", () => {
    expect(numberedName("Winter Shield", [`Spring Cup ${year}`])).toBe(`Winter Shield ${year}`);
  });

  it("suggests something, and never what is already in the field", () => {
    const first = suggestName();
    expect(first).toContain(String(year));

    for (let i = 0; i < 30; i += 1) {
      expect(suggestName(first)).not.toBe(first);
    }
  });

  it("avoids names already on this device", () => {
    const taken = Array.from({ length: 40 }, () => suggestName());
    const next = suggestName(undefined, taken);
    // Either a fresh combination, or the same one carrying an edition number.
    expect(taken).not.toContain(next);
  });

  it("names nothing after a sport", () => {
    const sports = /petanque|pétanque|football|chess|tennis|rugby|darts|padel/i;
    for (let i = 0; i < 200; i += 1) {
      expect(suggestName()).not.toMatch(sports);
    }
  });
});
