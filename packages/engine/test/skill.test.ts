/**
 * The project skill tells an agent where things are and what the invariants are.
 * A skill that has drifted from the code is worse than no skill, because it is
 * followed confidently. These tests keep its claims true.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const skill = readFileSync(resolve(repo, ".claude/skills/bracketeer/SKILL.md"), "utf8");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const engineSources = sourceFiles(resolve(repo, "packages/engine/src"));
const engineCode = engineSources.map((f) => readFileSync(f, "utf8")).join("\n");

describe("the project skill", () => {
  it("declares a frontmatter block the loader accepts", () => {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(skill);
    expect(match).not.toBeNull();

    const frontmatter = match?.[1] ?? "";
    const name = /^name:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim();
    const description = /^description:\s*(.+)$/m.exec(frontmatter)?.[1]?.trim() ?? "";

    expect(name).toBe("bracketeer");
    expect(name).toMatch(/^[a-z0-9-]{1,64}$/);
    expect(description.length).toBeGreaterThan(40);
    expect(description.length).toBeLessThanOrEqual(1024);
    // Angle brackets in a description are read as markup by the loader.
    expect(description).not.toMatch(/[<>]/);
  });

  it("points only at files that exist", () => {
    const paths = [
      ...skill.matchAll(/`((?:packages|apps|examples|test)[\w./-]*\.[jt]sx?|[\w/]+\.json)`/g),
    ].map((m) => m[1] as string);

    // The layout block lists directories; check those too.
    const layout = [
      "packages/engine/src/domain/config.ts",
      "packages/engine/src/domain/entities.ts",
      "packages/engine/src/scoring/normalize.ts",
      "packages/engine/src/standings/tiebreakers.ts",
      "packages/engine/src/pairing/cost.ts",
      "packages/engine/src/pairing/index.ts",
      "packages/engine/src/commands/index.ts",
      "packages/engine/src/util/rng.ts",
      "packages/engine/src/codec/index.ts",
      "apps/web/src/lib/format.ts",
      "apps/web/src/lib/examples.ts",
      "apps/web/src/components/Sheet.tsx",
      "apps/web/src/components/ScoreEntry.tsx",
      "apps/web/src/routes/panels/Config.tsx",
      "packages/engine/test/tournament.ts",
      "packages/engine/test/formats-extra.test.ts",
      "packages/engine/test/pairing.test.ts",
    ];

    for (const path of [...paths, ...layout]) {
      const full = resolve(repo, path.startsWith("test/") ? `packages/engine/${path}` : path);
      expect(() => statSync(full), `skill references a missing file: ${path}`).not.toThrow();
    }
  });

  it("names symbols that actually exist", () => {
    const symbols = [
      "normalizeResult",
      "createRng",
      "parseConfig",
      "replay",
      "buildStageMatches",
      "isStageComplete",
      "separationCost",
      "orderForStrategy",
      "urlSizeVerdict",
      "tiebreakerKeySchema",
      "scoreConfigSchema",
      "pairingStrategySchema",
      "innerStageSchema",
      "stageConfigSchema",
      "winnerOf",
      "loserOf",
      "Compressor",
    ];

    for (const symbol of symbols) {
      expect(engineCode, `skill names a missing symbol: ${symbol}`).toContain(symbol);
    }
  });

  it("states the determinism invariant, and the invariant holds", () => {
    expect(skill).toMatch(/Math\.random/);

    // The claim the skill makes about the engine, enforced.
    const offenders = engineSources.filter((file) => {
      const code = readFileSync(file, "utf8");
      const withoutComments = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      return /Math\.random\s*\(|Date\.now\s*\(|new Date\s*\(\s*\)/.test(withoutComments);
    });

    expect(offenders.map((f) => f.replace(repo, ""))).toEqual([]);
  });

  it("keeps the score-kind switch confined to the normalisation seam", () => {
    // The skill promises that nothing outside normalize.ts branches on the score
    // kind. If that stops being true, the seam has leaked and the skill lies.
    //
    // "points" alone is not evidence — it is also the name of a tiebreaker — so
    // this looks for the kinds that can only mean a scoreline.
    const leaks = engineSources.filter((file) => {
      if (file.endsWith("normalize.ts")) return false;
      const code = readFileSync(file, "utf8");
      return /case\s+"(sets|placement)":/.test(code);
    });

    expect(leaks.map((f) => f.replace(repo, ""))).toEqual([]);
  });

  it("lists formats that really are reachable without engine code", () => {
    for (const claim of ["Monrad", "Danish", "Pool play", "Top cut", "King of the hill"]) {
      expect(skill).toContain(claim);
    }
  });
});
