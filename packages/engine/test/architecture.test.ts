/**
 * Two architectural rules the engine depends on, enforced rather than trusted.
 *
 * Both are the kind of thing that stays true for a year and then quietly stops,
 * in a change that looks entirely reasonable on its own.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const engineRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".ts")) out.push(full);
  }
  return out;
}

const sources = sourceFiles(resolve(engineRoot, "src"));

describe("the engine is deterministic", () => {
  it("never calls Math.random or reads the clock", () => {
    /**
     * Two devices replaying the same log must reach identical state. A random
     * draw that differs between phones silently forks a tournament, and nobody
     * notices until the standings disagree. Every draw comes from the seed in
     * the log instead, through util/rng.
     */
    const offenders = sources.filter((file) => {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      return /Math\.random\s*\(|Date\.now\s*\(|new Date\s*\(\s*\)/.test(code);
    });

    expect(offenders.map((f) => f.replace(engineRoot, ""))).toEqual([]);
  });
});

describe("scoring has exactly one seam", () => {
  it("keeps the score-kind switch inside normalize.ts", () => {
    /**
     * Every score kind collapses into one NormalizedOutcome, and standings,
     * ratings and bracket progression read only that. A second switch elsewhere
     * is the beginning of the drift this seam exists to prevent.
     *
     * "points" alone is not evidence — it is also the name of a tiebreaker — so
     * this looks for the kinds that can only mean a scoreline.
     */
    const leaks = sources.filter((file) => {
      if (file.endsWith("normalize.ts")) return false;
      return /case\s+"(sets|placement)":/.test(readFileSync(file, "utf8"));
    });

    expect(leaks.map((f) => f.replace(engineRoot, ""))).toEqual([]);
  });
});

describe("no sport is named anywhere in the engine", () => {
  it("keeps even the comments free of them", () => {
    /**
     * The premise is that the engine knows nothing about any sport. Naming one
     * in a comment is how that starts to erode: first it is an illustration,
     * then it is a special case, then it is a mode. Describing the mechanism is
     * more precise anyway — "first to a target" says more than a sport's name.
     */
    const sports = [
      "petanque", "pétanque", "boules", "football", "soccer", "chess", "tennis",
      "padel", "pickleball", "esports", "basketball", "cricket", "curling",
      "bowling", "darts", "volleyball", "rugby", "hockey", "golf", "badminton",
      "squash", "softball", "mario kart", "backgammon", "scrabble",
    ];

    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const sport of sports) {
        if (new RegExp(`\\b${sport}\\b`).test(text)) {
          offenders.push(`${file.replace(engineRoot, "")}: ${sport}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
