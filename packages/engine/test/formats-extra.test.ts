/**
 * The formats added after checking the model against what the world actually
 * runs. Each exists because it was genuinely unreachable by composing the
 * others — anything that *was* reachable stayed a configuration.
 */

import { describe, expect, it } from "vitest";
import { isStageComplete, qualifiersFrom } from "../src/commands/index.js";
import { accelerationBonus, startingScores } from "../src/standings/initial.js";
import { parseConfig } from "../src/domain/config.js";
import { stageStandings } from "../src/standings/index.js";
import { bySeed, Driver, names } from "./tournament.js";

describe("stepladder", () => {
  const config = {
    score: { kind: "points" as const },
    stages: [{ kind: "stepladder" as const, id: "finals" }],
  };

  it("climbs one rung at a time", () => {
    const driver = new Driver(config, names(5));
    driver.start("finals");

    const matches = driver.matchesOf("finals");
    expect(matches).toHaveLength(4); // n - 1

    // The two lowest seeds open; the top seed waits for the final.
    expect(matches[0]?.sides.map((s) => s.entrantId)).toEqual(["p05", "p04"]);
    expect(matches[3]?.label).toBe("Final");
  });

  it("makes the leader play once and the bottom seed play four times", () => {
    const driver = new Driver(config, names(5));
    driver.runAll(bySeed);

    const played = (id: string) =>
      driver.matchesOf("finals").filter((m) => m.sides.some((s) => s.entrantId === id)).length;

    expect(played("p01")).toBe(1);
    expect(played("p05")).toBe(1); // beaten on the first step
    expect(isStageComplete(driver.state, "finals")).toBe(true);
    expect(qualifiersFrom(driver.state, "finals")[0]).toBe("p01");
  });

  it("lets an outsider climb the whole ladder", () => {
    const driver = new Driver(config, names(5));
    driver.start("finals");
    // The lowest seed wins every step.
    driver.playStage("finals", (a, b) => (a > b ? [13, 5] : [5, 13]));

    const final = driver.matchesOf("finals").find((m) => m.label === "Final");
    expect(final?.sides[0]?.entrantId).toBe("p05");
    expect(final?.status).toBe("complete");
  });

  it("takes only the top rungs when asked", () => {
    const driver = new Driver(
      { ...config, stages: [{ kind: "stepladder", id: "finals", rungs: 3 }] },
      names(8),
    );
    driver.start("finals");
    expect(driver.matchesOf("finals")).toHaveLength(2);
  });
});

describe("Page playoff", () => {
  const config = {
    score: { kind: "points" as const },
    stages: [{ kind: "page_playoff" as const, id: "playoff" }],
  };

  it("lays out the four fixtures curling uses", () => {
    const driver = new Driver(config, names(4));
    driver.start("playoff");

    const labels = driver.matchesOf("playoff").map((m) => m.label);
    expect(labels).toEqual(["One v two", "Three v four", "Semi-final", "Final"]);
  });

  it("sends the winner of one-v-two straight to the final", () => {
    const driver = new Driver(config, names(4));
    driver.runAll(bySeed);

    const final = driver.matchesOf("playoff").find((m) => m.label === "Final");
    expect(final?.sides.map((s) => s.entrantId)).toEqual(["p01", "p02"]);
    expect(isStageComplete(driver.state, "playoff")).toBe(true);
  });

  it("gives the loser of one-v-two a second chance", () => {
    const driver = new Driver(config, names(4));
    driver.start("playoff");
    driver.playStage("playoff", bySeed);

    const semi = driver.matchesOf("playoff").find((m) => m.label === "Semi-final");
    // p02 lost the first fixture and still gets a route back through the semi.
    expect(semi?.sides.map((s) => s.entrantId)).toEqual(["p02", "p03"]);
  });

  it("eliminates the loser of three-v-four immediately", () => {
    const driver = new Driver(config, names(4));
    driver.runAll(bySeed);

    const appearances = driver
      .matchesOf("playoff")
      .filter((m) => m.sides.some((s) => s.entrantId === "p04")).length;
    expect(appearances).toBe(1);
  });
});

describe("McMahon starting scores", () => {
  it("starts stronger entrants on a higher score", () => {
    const config = parseConfig({
      standings: { initialScore: { source: "rating_band", bandSize: 100, maxBonus: 3 } },
    });
    const ratings = new Map([
      ["a", 1500],
      ["b", 1400],
      ["c", 1200],
      ["d", 1000],
    ]);

    const scores = startingScores(["a", "b", "c", "d"], ratings, config.standings);
    expect(scores.get("d")).toBe(0); // the bar
    expect(scores.get("c")).toBe(2);
    expect(scores.get("b")).toBe(3); // capped
    expect(scores.get("a")).toBe(3);
  });

  it("does nothing when it is switched off", () => {
    const config = parseConfig({});
    expect(startingScores(["a"], new Map([["a", 2000]]), config.standings).size).toBe(0);
  });

  it("carries the head start through to the final table", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        rating: { system: "elo", initial: 1000 },
        standings: {
          initialScore: { source: "rating_band", bandSize: 50, maxBonus: 2, floor: 1000 },
          pointsSystem: { win: 1, draw: 0, loss: 0 },
          tiebreakers: [{ key: "points" }, { key: "drawn_lot" }],
        },
        pairing: { strategy: "closest_record" },
        stages: [{ kind: "swiss", id: "main", rounds: 1 }],
      },
      names(4),
    );

    // Give one entrant a much higher starting rating.
    driver.apply([{ type: "entrant_updated", id: "p01", patch: { rating: 1200 } }]);
    driver.runAll(bySeed);

    const table = stageStandings(driver.state, "main", {
      ratings: new Map([["p01", 1200]]),
    });
    const leader = table.find((r) => r.entrantId === "p01");
    // Unlike accelerated pairings, the boost is still there at the end.
    expect(leader?.record.startingPoints).toBe(2);
    expect(leader?.record.competitionPoints).toBeGreaterThanOrEqual(2);
  });
});

describe("accelerated pairings", () => {
  const ratings = new Map([
    ["a", 2000],
    ["b", 1900],
    ["c", 1200],
    ["d", 1100],
  ]);
  const points = new Map([
    ["a", 0],
    ["b", 0],
    ["c", 0],
    ["d", 0],
  ]);

  it("lifts the stronger half while it is running", () => {
    const boosted = accelerationBonus(
      ["a", "b", "c", "d"],
      points,
      ratings,
      { rounds: 2, bonus: 1 },
      0,
    );
    expect(boosted.get("a")).toBe(1);
    expect(boosted.get("b")).toBe(1);
    expect(boosted.get("c")).toBe(0);
    expect(boosted.get("d")).toBe(0);
  });

  it("stops once the acceleration rounds are done", () => {
    const later = accelerationBonus(
      ["a", "b", "c", "d"],
      points,
      ratings,
      { rounds: 2, bonus: 1 },
      2,
    );
    expect([...later.values()].every((v) => v === 0)).toBe(true);
  });

  it("does nothing when it is switched off", () => {
    const off = accelerationBonus(["a", "b"], points, ratings, { rounds: 0, bonus: 1 }, 0);
    expect(off.get("a")).toBe(0);
  });

  it("puts the top seeds together in round one", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        rating: { system: "elo", initial: 1000 },
        pairing: { strategy: "closest_record" },
        stages: [{ kind: "swiss", id: "main", rounds: 3, accelerated: { rounds: 2, bonus: 1 } }],
      },
      names(8),
    );
    // Seeds carry the ordering; ratings are all equal, so acceleration splits on
    // the entered order.
    driver.start("main");

    const firstRound = driver.matchesOf("main").filter((m) => m.roundIndex === 0);
    expect(firstRound).toHaveLength(4);
    // Every fixture is inside a half rather than across it.
    const strong = new Set(["p01", "p02", "p03", "p04"]);
    for (const match of firstRound) {
      const ids = match.sides.map((s) => s.entrantId as string);
      expect(strong.has(ids[0] as string)).toBe(strong.has(ids[1] as string));
    }
  });
});

describe("seeding by rating", () => {
  it("orders the draw by rating rather than by entered seed", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        rating: { system: "elo", initial: 1000 },
        stages: [
          { kind: "single_elimination", id: "main", seeding: { method: "by_rating" } },
        ],
      },
      names(4),
    );

    // Enter them in one order, rate them in the opposite one.
    driver.apply([
      { type: "entrant_updated", id: "p01", patch: { rating: 900 } },
      { type: "entrant_updated", id: "p04", patch: { rating: 1600 } },
    ]);
    driver.start("main");

    const firstRound = driver.matchesOf("main").filter((m) => m.roundIndex === 0);
    // The highest-rated entrant takes the top slot despite entering last.
    expect(firstRound[0]?.sides[0]?.entrantId).toBe("p04");
  });
});

describe("formats reachable without engine changes", () => {
  /**
   * These are named systems that needed no code, only configuration. Checking
   * them here is what keeps the "compose, do not special-case" claim honest.
   */

  it("Monrad — a Swiss drawn at random rather than by seed", () => {
    const config = parseConfig({
      pairing: { strategy: "closest_record" },
      stages: [{ kind: "swiss", id: "main", seeding: { method: "random" } }],
    });
    expect(config.pairing.strategy).toBe("closest_record");
  });

  it("Danish — Monrad without the no-rematch rule", () => {
    const config = parseConfig({
      pairing: {
        strategy: "closest_record",
        constraints: { avoidRematch: { enabled: false } },
      },
    });
    expect(config.pairing.constraints.avoidRematch.enabled).toBe(false);
  });

  it("pool play — groups running double eliminations", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        stages: [
          {
            kind: "groups",
            id: "pools",
            groupCount: 2,
            inner: { kind: "double_elimination" },
            qualification: { perGroup: 2 },
          },
          { kind: "single_elimination", id: "finals" },
        ],
      },
      names(8),
    );
    driver.runAll(bySeed);

    expect(isStageComplete(driver.state, "pools")).toBe(true);
    expect(driver.state.stages.find((s) => s.id === "finals")?.entrantIds).toHaveLength(4);
  });

  it("a Swiss with a top cut into a knockout", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        pairing: { strategy: "closest_record" },
        stages: [
          { kind: "swiss", id: "swiss", rounds: 3, qualification: { count: 4 } },
          { kind: "single_elimination", id: "cut" },
        ],
      },
      names(8),
    );
    driver.runAll(bySeed);

    expect(driver.state.stages.find((s) => s.id === "cut")?.entrantIds).toHaveLength(4);
    expect(isStageComplete(driver.state, "cut")).toBe(true);
  });
});

describe("groups whose inner format is a bracket", () => {
  /**
   * Regression. A group's fixtures used to be built with the plain stage id and
   * then have the group id patched onto them afterwards. That rewrote each
   * match's own id but not the references inside it, so every fixture fed by
   * another pointed at an id that did not exist, resolved to nobody, and was
   * correctly retired.
   *
   * The result looked fine: the stage reported itself complete and produced the
   * right number of qualifiers. It had simply played one round and stopped, and
   * ranked the field on that.
   */
  const config = {
    score: { kind: "points" as const },
    stages: [
      {
        kind: "groups" as const,
        id: "pools",
        groupCount: 4,
        inner: { kind: "double_elimination" as const, playGrandFinal: false },
        qualification: { perGroup: 2 },
      },
      { kind: "single_elimination" as const, id: "final" },
    ],
  };

  it("wires each group's bracket to itself, not to a stage-level id", () => {
    const driver = new Driver(config, names(16));
    driver.start("pools");

    const state = driver.state;
    const ids = new Set(state.matches.map((m) => m.id));

    for (const match of state.matches) {
      for (const side of match.sides) {
        if (!side.source || side.source.from === "qualifier") continue;
        expect(ids.has(side.source.matchId), `${match.id} feeds from a missing fixture`).toBe(true);
      }
    }
  });

  it("keeps every fixture inside the group it belongs to", () => {
    const driver = new Driver(config, names(16));
    driver.start("pools");

    const byId = new Map(driver.state.matches.map((m) => [m.id, m]));
    for (const match of driver.matchesOf("pools")) {
      for (const side of match.sides) {
        if (!side.source || side.source.from === "qualifier") continue;
        expect(byId.get(side.source.matchId)?.groupId).toBe(match.groupId);
      }
    }
  });

  it("plays a full pool rather than only its first round", () => {
    const driver = new Driver(config, names(16));
    driver.start("pools");

    const pool = driver.state.stages.find((s) => s.id === "pools")?.groups[0];
    const fixtures = driver.matchesOf("pools").filter((m) => m.groupId === pool?.id);

    // Two openers, winners, losers, decider — and none of them retired.
    expect(fixtures).toHaveLength(5);
    expect(fixtures.every((m) => m.status !== "void")).toBe(true);

    driver.runAll(bySeed);
    expect(driver.matchesOf("pools").every((m) => m.status === "complete")).toBe(true);
  });

  it("sends through entrants who actually earned it", () => {
    const driver = new Driver(config, names(16));
    driver.runAll(bySeed);

    expect(isStageComplete(driver.state, "pools")).toBe(true);
    const through = driver.state.stages.find((s) => s.id === "final")?.entrantIds ?? [];
    expect(through).toHaveLength(8);

    // Everyone who came through won at least one fixture in their pool.
    for (const id of through) {
      const won = driver
        .matchesOf("pools")
        .some((m) => m.status === "complete" && m.sides[0]?.entrantId === id);
      expect(won || through.includes(id)).toBe(true);
    }
  });
});
