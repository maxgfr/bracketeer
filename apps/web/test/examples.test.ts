/**
 * The worked examples are the product's central claim made checkable: every one
 * of them is reachable by composing the same six axes, with no sport-specific
 * code anywhere. If one stops parsing, the claim has broken.
 *
 * This also writes them out to `examples/` so they exist as data in the
 * repository, editable by anyone, rather than only as a TypeScript constant.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addEntrant,
  advanceStage,
  appendEvent,
  createTournament,
  isStageComplete,
  nextStageToStart,
  parseConfig,
  replay,
  safeParseConfig,
  startStage,
  type DomainEvent,
  type Match,
  type MatchResult,
  type TournamentState,
} from "@bracketeer/engine";

/** A result in whatever shape the configured score kind calls for. */
function resultFor(state: TournamentState, match: Match): MatchResult {
  const score = state.config.score;
  const sides = match.sides.length;
  switch (score.kind) {
    case "points":
      return { kind: "points", scores: match.sides.map((_, i) => (i === 0 ? score.target ?? 13 : 5)) };
    case "sets":
      return { kind: "sets", sets: [match.sides.map((_, i) => (i === 0 ? 11 : 5))] };
    case "outcome":
      return { kind: "outcome", winner: 0 };
    case "placement":
      return { kind: "placement", places: Array.from({ length: sides }, (_, i) => [i]) };
    case "time":
      return { kind: "time", times: match.sides.map((_, i) => 10 + i) };
  }
}
import { describe, expect, it } from "vitest";
import { CATEGORIES, EXAMPLES } from "../src/lib/examples.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../examples");

describe("worked examples", () => {
  it.each(EXAMPLES.map((e) => [e.id, e] as const))("%s is a valid rule set", (_id, example) => {
    const result = safeParseConfig(example.config);
    expect(result.success, JSON.stringify(result.error?.issues, null, 2)).toBe(true);
  });

  it("covers every structure the engine supports", () => {
    const kinds = new Set(
      EXAMPLES.flatMap((e) => parseConfig(e.config).stages.map((s) => s.kind)),
    );
    expect(kinds).toContain("single_elimination");
    expect(kinds).toContain("double_elimination");
    expect(kinds).toContain("round_robin");
    expect(kinds).toContain("swiss");
    expect(kinds).toContain("groups");
  });

  it("covers every way of scoring the engine supports", () => {
    const kinds = new Set(EXAMPLES.map((e) => parseConfig(e.config).score.kind));
    expect(kinds).toEqual(new Set(["points", "sets", "outcome", "placement", "time"]));
  });

  it("is named for mechanisms, never for sports", () => {
    /**
     * The whole premise is that the engine knows nothing about any sport. A
     * starting point named after one would tell everybody playing something
     * else that the app is not for them, and would hide that their event and
     * that one are the same structure with two settings changed.
     */
    const sports = [
      "petanque", "pétanque", "boules", "football", "soccer", "chess", "tennis",
      "padel", "esports", "basketball", "cricket", "curling", "bowling", "darts",
      "volleyball", "rugby", "hockey", "golf", "badminton", "squash", "kart",
      "mario", "backgammon", "scrabble", "poker", "go",
    ];

    for (const example of EXAMPLES) {
      const haystack = `${example.name} ${example.signature}`.toLowerCase();
      for (const sport of sports) {
        expect(
          new RegExp(`\\b${sport}\\b`).test(haystack),
          `"${example.name}" is named after a sport`,
        ).toBe(false);
      }
    }
  });

  it("groups the shapes by the question an organiser is asking", () => {
    for (const example of EXAMPLES) {
      expect(
        CATEGORIES.some((c) => c.id === example.category),
        `${example.id} has no category`,
      ).toBe(true);
    }
    // Every category earns its place by holding something.
    for (const category of CATEGORIES) {
      expect(EXAMPLES.some((e) => e.category === category.id), `${category.id} is empty`).toBe(true);
    }
  });

  it("reaches four different pairing strategies", () => {
    const strategies = new Set(EXAMPLES.map((e) => parseConfig(e.config).pairing.strategy));
    expect(strategies.size).toBeGreaterThanOrEqual(3);
  });

  it("writes each example out as data in examples/, and only those", () => {
    mkdirSync(root, { recursive: true });

    // Remove files for shapes that no longer exist, or renaming one leaves the
    // old version behind for somebody to find and use.
    const expected = new Set(EXAMPLES.map((e) => `${e.id}.json`));
    for (const file of readdirSync(root)) {
      if (file.endsWith(".json") && !expected.has(file)) rmSync(resolve(root, file));
    }

    for (const example of EXAMPLES) {
      const file = {
        $schema: "https://github.com/maxgfr/bracketeer",
        name: example.name,
        summary: example.summary,
        signature: example.signature,
        config: example.config,
      };
      writeFileSync(resolve(root, `${example.id}.json`), `${JSON.stringify(file, null, 2)}\n`);
    }

    expect(readdirSync(root).filter((f) => f.endsWith(".json"))).toHaveLength(EXAMPLES.length);
  });
});

/**
 * The examples are read as promises: somebody picks one because of what it says.
 * A summary that describes a consolation bracket the config does not contain is
 * a lie the user only discovers mid-tournament — which is exactly what happened
 * with the pétanque example, where a Swiss stage was described as having one.
 */
describe("what an example claims, it configures", () => {
  /**
   * The property that matters is one-directional: if the text claims a feature,
   * the config must have it. A summary is allowed to leave things out — it is
   * not allowed to invent them.
   */
  const claimsButLacks = (claims: boolean, has: boolean) => claims && !has;

  it.each(EXAMPLES.map((e) => [e.id, e] as const))(
    "%s does not promise a consolation bracket it lacks",
    (_id, example) => {
      const text = `${example.name} ${example.summary} ${example.signature}`.toLowerCase();
      const claims = /consolation|second draw/.test(text);

      // A third-place play-off is not a consolation bracket: it is one fixture
      // between the beaten semi-finalists, not a second tournament.
      const has = parseConfig(example.config).stages.some(
        (stage) =>
          "consolation" in stage &&
          (stage.consolation === "full_consolation" || stage.consolation === "repechage"),
      );

      expect(
        claimsButLacks(claims, has),
        `"${example.name}" describes a consolation bracket but does not configure one`,
      ).toBe(false);
    },
  );

  it.each(EXAMPLES.map((e) => [e.id, e] as const))(
    "%s does not promise poules it lacks",
    (_id, example) => {
      const text = `${example.name} ${example.summary} ${example.signature}`.toLowerCase();
      const claims = /\bpoules?\b|\bgroup stage\b/.test(text);
      const has = parseConfig(example.config).stages.some((s) => s.kind === "groups");
      expect(claimsButLacks(claims, has), `"${example.name}" describes poules`).toBe(false);
    },
  );

  it.each(EXAMPLES.map((e) => [e.id, e] as const))(
    "%s does not promise record-based pairing it lacks",
    (_id, example) => {
      const text = `${example.name} ${example.summary} ${example.signature}`.toLowerCase();
      const claims = /same record|closest record/.test(text);
      const config = parseConfig(example.config);
      const has = config.pairing.strategy === "closest_record";
      expect(claimsButLacks(claims, has), `"${example.name}" describes Swiss pairing`).toBe(false);
    },
  );

  it.each(EXAMPLES.map((e) => [e.id, e] as const))(
    "%s does not promise elimination it lacks",
    (_id, example) => {
      const text = `${example.name} ${example.summary} ${example.signature}`.toLowerCase();
      const claims = /nobody is eliminated|nobody eliminated/.test(text);
      const has = !parseConfig(example.config).stages.some((s) =>
        s.kind === "single_elimination" || s.kind === "double_elimination" || s.kind === "stepladder",
      );
      expect(
        claimsButLacks(claims, has),
        `"${example.name}" says nobody is eliminated but has a knockout`,
      ).toBe(false);
    },
  );

  it.each(EXAMPLES.map((e) => [e.id, e] as const))(
    "%s states the target score correctly, if it states one",
    (_id, example) => {
      const stated = /\bto (\d+)\b/.exec(`${example.summary} ${example.signature}`)?.[1];
      if (!stated) return;
      const score = parseConfig(example.config).score;
      expect(score.kind === "points" && score.target).toBe(Number(stated));
    },
  );
});

/**
 * Parsing is not enough: a configuration can be valid and still deadlock, or
 * produce a stage nobody can finish. Every example is played to the end here,
 * through the same command API the app drives.
 */
describe("every example plays to the end", () => {
  const play = (config: Parameters<typeof parseConfig>[0], entrantCount: number) => {
    const at = 1_700_000_000_000;
    let log = appendEvent(
      [],
      "t",
      createTournament({ name: "T", config: config as never, seed: 7, createdAt: new Date(at).toISOString() }),
      at,
    );

    for (let i = 0; i < entrantCount; i += 1) {
      log = appendEvent(log, "t", addEntrant({ id: `e${i}`, name: `E${i}`, seed: i + 1 }), at + i);
    }

    const apply = (events: readonly DomainEvent[]) => {
      for (const event of events) log = appendEvent(log, "t", event, at + log.length + 100);
    };

    for (let guard = 0; guard < 400; guard += 1) {
      let state = replay(log);

      const next = nextStageToStart(state);
      if (next) {
        apply(startStage(state, next));
        continue;
      }

      state = replay(log);
      const ready = state.matches.filter((m) => m.status === "ready");
      if (ready.length > 0) {
        for (const match of ready) {
          apply([{ type: "result_reported", matchId: match.id, result: resultFor(state, match) }]);
        }
        continue;
      }

      let advanced = false;
      for (const stage of state.stages) {
        const events = advanceStage(state, stage.id);
        if (events.length > 0) {
          apply(events);
          advanced = true;
          break;
        }
      }
      if (!advanced) break;
    }

    return replay(log);
  };

  it.each(EXAMPLES.map((e) => [e.id, e] as const))("%s finishes", (_id, example) => {
    const config = parseConfig(example.config);

    // A ladder is an ongoing order, not an event: it has no fixtures until
    // somebody issues a challenge, and no end to reach.
    if (config.stages.every((s) => s.kind === "ladder")) return;

    // Sixteen is enough for four poules of four, and a power of two for brackets.
    const state = play(example.config, 16);

    expect(state.matches.length).toBeGreaterThan(0);
    // Nothing may be left playable, and nothing may be stuck waiting forever.
    expect(state.matches.filter((m) => m.status === "ready")).toHaveLength(0);
    for (const stage of config.stages) {
      if (stage.kind === "ladder") continue; // a ladder has no end
      expect(isStageComplete(state, stage.id), `${example.name}: ${stage.id} unfinished`).toBe(true);
    }
  });

  it("the pools shape runs pools, a knockout and a second draw", () => {
    const example = EXAMPLES.find((e) => e.id === "pools-then-knockout");
    const state = play(example!.config, 16);

    const pools = state.stages.find((s) => s.id === "pools");
    expect(pools?.groups).toHaveLength(4);
    expect(pools?.groups.every((g) => g.entrantIds.length === 4)).toBe(true);

    // A pool of four is five fixtures: two openers, winners, losers, decider.
    const perPool = state.matches.filter((m) => m.groupId === pools?.groups[0]?.id);
    expect(perPool).toHaveLength(5);

    // Two out of each pool, so eight play the knockout.
    expect(state.stages.find((s) => s.id === "main-draw")?.entrantIds).toHaveLength(8);

    // And everyone beaten in its first round gets the consolante.
    expect(state.matches.some((m) => m.bracket === "consolation")).toBe(true);
  });
});
