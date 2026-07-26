import { describe, expect, it } from "vitest";
import { isStageComplete, qualifiersFrom } from "../src/commands/index.js";
import { stageStandings } from "../src/standings/index.js";
import { bySeed, Driver, names, strongerWins } from "./tournament.js";

describe("single elimination", () => {
  const config = (over: Record<string, unknown> = {}) => ({
    score: { kind: "points" as const, target: 13 },
    stages: [{ kind: "single_elimination" as const, id: "main", ...over }],
  });

  it("plays a clean bracket down to one winner", () => {
    const driver = new Driver(config(), names(8));
    driver.runAll(bySeed);

    expect(driver.matchesOf("main")).toHaveLength(7); // n - 1
    expect(isStageComplete(driver.state, "main")).toBe(true);
    expect(qualifiersFrom(driver.state, "main")[0]).toBe("p01");
  });

  it("keeps the top seeds apart until the final", () => {
    const driver = new Driver(config(), names(8));
    driver.start("main");

    const firstRound = driver.matchesOf("main").filter((m) => m.roundIndex === 0);
    const pairs = firstRound.map((m) => m.sides.map((s) => s.entrantId));
    expect(pairs).toEqual([
      ["p01", "p08"],
      ["p04", "p05"],
      ["p02", "p07"],
      ["p03", "p06"],
    ]);
  });

  it("walks the top seeds over when the field is not a power of two", () => {
    const driver = new Driver(config(), names(5));
    driver.start("main");

    const byes = driver.matchesOf("main").filter((m) => m.status === "bye");
    expect(byes).toHaveLength(3);
    // The strongest entrant is the one who gets the walkover.
    expect(byes[0]?.sides[0]?.entrantId).toBe("p01");

    driver.runAll(bySeed);
    expect(isStageComplete(driver.state, "main")).toBe(true);
    expect(qualifiersFrom(driver.state, "main")[0]).toBe("p01");
  });

  it("adds a play-off for third place when asked", () => {
    const driver = new Driver(config({ consolation: "third_place" }), names(8));
    driver.runAll(bySeed);

    const third = driver.matchesOf("main", "third_place");
    expect(third).toHaveLength(1);
    expect(third[0]?.status).toBe("complete");
    // The two beaten semi-finalists, not the beaten finalist.
    expect(third[0]?.sides.map((s) => s.entrantId).sort()).toEqual(["p03", "p04"]);
  });

  describe("consolation bracket", () => {
    it("gives every first-round loser another tournament", () => {
      const driver = new Driver(config({ consolation: "full_consolation" }), names(8));
      driver.start("main");

      const consolation = driver.matchesOf("main", "consolation");
      // Four first-round losers, so a four-entrant knockout: two plus a final.
      expect(consolation).toHaveLength(3);

      driver.runAll(bySeed);

      // Losing to the eventual champion in round one no longer ends your day.
      const beatenByChampion = driver
        .matchesOf("main", "consolation")
        .flatMap((m) => m.sides.map((s) => s.entrantId));
      expect(beatenByChampion).toContain("p08");
      expect(driver.matchesOf("main", "consolation").every((m) => m.status === "complete")).toBe(
        true,
      );
    });

    it("crowns a consolation winner distinct from the main winner", () => {
      const driver = new Driver(config({ consolation: "full_consolation" }), names(8));
      driver.runAll(bySeed);

      const consolationFinal = driver
        .matchesOf("main", "consolation")
        .sort((a, b) => b.roundIndex - a.roundIndex)[0];
      const winner = consolationFinal?.sides[0]?.entrantId;
      expect(winner).toBe("p05"); // the strongest of the first-round losers
      expect(winner).not.toBe("p01");
    });
  });
});

describe("double elimination", () => {
  const config = (over: Record<string, unknown> = {}) => ({
    score: { kind: "points" as const },
    stages: [{ kind: "double_elimination" as const, id: "main", ...over }],
  });

  it("gives everybody a second life", () => {
    const driver = new Driver(config(), names(8));
    driver.start("main");

    // 2n - 2 fixtures before any reset: 7 upper, 6 lower, 1 grand final.
    expect(driver.matchesOf("main")).toHaveLength(14);
    expect(driver.matchesOf("main", "lower")).toHaveLength(6);
  });

  it("runs to completion with a single winner", () => {
    const driver = new Driver(config(), names(8));
    driver.runAll(bySeed);

    expect(isStageComplete(driver.state, "main")).toBe(true);
    expect(qualifiersFrom(driver.state, "main")[0]).toBe("p01");
  });

  it("drops a beaten entrant into the lower bracket rather than out", () => {
    const driver = new Driver(config(), names(8));
    driver.start("main");
    const firstRound = driver.matchesOf("main", "main").filter((m) => m.roundIndex === 0);

    for (const match of firstRound) {
      const [a, b] = match.sides.map((s) => s.entrantId);
      if (a && b) driver.report(match.id, { kind: "points", scores: [13, 5] });
    }

    const lowerRound0 = driver.matchesOf("main", "lower").filter((m) => m.roundIndex === 0);
    const inLower = lowerRound0.flatMap((m) => m.sides.map((s) => s.entrantId));
    expect(inLower.sort()).toEqual(["p05", "p06", "p07", "p08"]);
  });

  it("plays a decider when the lower-bracket entrant wins the grand final", () => {
    const driver = new Driver(config({ grandFinalReset: true }), names(4));

    // Let the weaker entrants win, so whoever reaches the final from the lower
    // bracket takes the first grand final.
    driver.start("main");
    driver.playStage("main", (a, b) => (a > b ? [13, 5] : [5, 13]));

    const finals = driver.matchesOf("main", "grand_final");
    expect(finals.length).toBeGreaterThanOrEqual(1);

    const first = finals.find((m) => m.roundIndex === 2);
    if (first?.result && first.result.kind === "points") {
      const lowerSideWon = (first.result.scores[1] ?? 0) > (first.result.scores[0] ?? 0);
      // A reset exists exactly when the lower-bracket side won the first final.
      expect(finals.some((m) => m.label === "Grand final (reset)")).toBe(lowerSideWon);
    }
  });

  it("does not play a decider when the unbeaten entrant holds on", () => {
    const driver = new Driver(config({ grandFinalReset: true }), names(4));
    driver.runAll(bySeed);

    const finals = driver.matchesOf("main", "grand_final");
    expect(finals.some((m) => m.label === "Grand final (reset)")).toBe(false);
    expect(isStageComplete(driver.state, "main")).toBe(true);
  });
});

describe("round robin", () => {
  it("has everyone play everyone once", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        stages: [{ kind: "round_robin", id: "league" }],
      },
      names(6),
    );
    driver.start("league");

    expect(driver.matchesOf("league")).toHaveLength(15); // 6 choose 2
    const rounds = new Set(driver.matchesOf("league").map((m) => m.roundIndex));
    expect(rounds.size).toBe(5);
  });

  it("plays a two-legged season with home and away", () => {
    const driver = new Driver(
      {
        match: { hasHomeSide: true },
        score: { kind: "points", allowDraw: true },
        standings: {
          pointsSystem: { win: 3, draw: 1, loss: 0 },
          tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "drawn_lot" }],
        },
        stages: [{ kind: "round_robin", id: "season", legs: 2 }],
      },
      names(4),
    );
    driver.runAll(bySeed);

    expect(driver.matchesOf("season")).toHaveLength(12); // 4 choose 2, twice
    const table = stageStandings(driver.state, "season");
    expect(table[0]?.entrantId).toBe("p01");
    expect(table[0]?.record.played).toBe(6);
    expect(isStageComplete(driver.state, "season")).toBe(true);
  });

  it("stands one entrant down each round when the field is odd", () => {
    const driver = new Driver(
      { score: { kind: "points" }, stages: [{ kind: "round_robin", id: "league" }] },
      names(5),
    );
    driver.start("league");

    for (let round = 0; round < 5; round += 1) {
      const byes = driver
        .matchesOf("league")
        .filter((m) => m.roundIndex === round && m.status === "bye");
      expect(byes).toHaveLength(1);
    }
  });
});

describe("swiss", () => {
  const config = (over: Record<string, unknown> = {}) => ({
    score: { kind: "points" as const, target: 13 },
    pairing: { strategy: "closest_record" as const },
    standings: {
      pointsSystem: { win: 1, draw: 0, loss: 0 },
      tiebreakers: [
        { key: "wins" as const },
        { key: "buchholz" as const },
        { key: "point_diff" as const },
        { key: "drawn_lot" as const },
      ],
    },
    stages: [{ kind: "swiss" as const, id: "main", ...over }],
  });

  it("draws one round at a time and stops at the target", () => {
    const driver = new Driver(config({ rounds: 4 }), names(8));
    driver.start("main");

    expect(driver.matchesOf("main")).toHaveLength(4); // round one only
    driver.playStage("main", bySeed);

    expect(driver.matchesOf("main")).toHaveLength(16); // 4 rounds of 4
    expect(isStageComplete(driver.state, "main")).toBe(true);
  });

  it("derives a round count from the field when none is given", () => {
    const driver = new Driver(config(), names(16));
    driver.runAll(bySeed);
    const rounds = new Set(driver.matchesOf("main").map((m) => m.roundIndex));
    expect(rounds.size).toBe(4); // ceil(log2(16))
  });

  it("never repeats a fixture", () => {
    const driver = new Driver(config({ rounds: 4 }), names(16));
    driver.runAll(bySeed);

    const seen = new Set<string>();
    for (const match of driver.matchesOf("main")) {
      const ids = match.sides.map((s) => s.entrantId).filter(Boolean).sort();
      if (ids.length < 2) continue;
      const key = ids.join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("eliminates nobody — a first-round loss costs the leaders, not the tournament", () => {
    const driver = new Driver(config({ rounds: 4 }), names(8));
    driver.runAll(bySeed);

    // The weakest entrant loses every round and still plays all four.
    const table = stageStandings(driver.state, "main");
    const last = table[table.length - 1];
    expect(last?.record.played).toBe(4);
    expect(table.every((row) => row.record.played + row.record.byes === 4)).toBe(true);
  });

  it("spreads byes around when the field is odd", () => {
    const driver = new Driver(config({ rounds: 3 }), names(7));
    driver.runAll(bySeed);

    const byeCounts = new Map<string, number>();
    for (const match of driver.matchesOf("main").filter((m) => m.status === "bye")) {
      const id = match.sides[0]?.entrantId;
      if (id) byeCounts.set(id, (byeCounts.get(id) ?? 0) + 1);
    }
    // Three rounds, one bye each, and never the same person twice.
    expect([...byeCounts.values()].every((c) => c === 1)).toBe(true);
    expect(byeCounts.size).toBe(3);
  });
});

describe("groups feeding a knockout", () => {
  it("splits the field, plays the groups, then advances the qualifiers", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        standings: {
          pointsSystem: { win: 3, draw: 1, loss: 0 },
          tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "drawn_lot" }],
        },
        stages: [
          {
            kind: "groups",
            id: "groups",
            groupCount: 4,
            inner: { kind: "round_robin" },
            qualification: { perGroup: 2 },
          },
          { kind: "single_elimination", id: "knockout" },
        ],
      },
      names(16),
    );

    driver.start("groups");
    const state = driver.state;
    const groups = state.stages.find((s) => s.id === "groups")?.groups ?? [];
    expect(groups).toHaveLength(4);
    expect(groups.every((g) => g.entrantIds.length === 4)).toBe(true);

    // Snake distribution keeps the top seeds apart.
    expect(groups[0]?.entrantIds[0]).toBe("p01");
    expect(groups[1]?.entrantIds[0]).toBe("p02");

    driver.runAll(bySeed);

    expect(isStageComplete(driver.state, "groups")).toBe(true);
    const knockout = driver.state.stages.find((s) => s.id === "knockout");
    expect(knockout?.entrantIds).toHaveLength(8);
    expect(isStageComplete(driver.state, "knockout")).toBe(true);
  });
});

describe("free-for-all", () => {
  it("runs heats of four and ranks by finishing position", () => {
    const driver = new Driver(
      {
        match: { sidesPerMatch: 4 },
        score: { kind: "placement", pointsByPlace: [15, 12, 10, 8] },
        standings: { pointsSource: "score", tiebreakers: [{ key: "points" }, { key: "drawn_lot" }] },
        pairing: { strategy: "random" },
        stages: [{ kind: "swiss", id: "heats", rounds: 3 }],
      },
      names(8),
    );

    driver.start("heats");
    expect(driver.matchesOf("heats")).toHaveLength(2);
    expect(driver.matchesOf("heats")[0]?.sides).toHaveLength(4);

    for (let round = 0; round < 3; round += 1) {
      for (const match of driver.playable()) {
        driver.report(match.id, { kind: "placement", places: [[0], [1], [2], [3]] });
      }
      driver.advance("heats");
    }

    expect(isStageComplete(driver.state, "heats")).toBe(true);
    const table = stageStandings(driver.state, "heats");
    expect(table).toHaveLength(8);
    expect(table[0]?.record.competitionPoints).toBeGreaterThan(
      table[7]?.record.competitionPoints ?? 0,
    );
  });
});

describe("determinism", () => {
  it("replays to identical state on a second run", () => {
    const build = () => {
      const driver = new Driver(
        {
          score: { kind: "points" },
          pairing: { strategy: "random" },
          stages: [{ kind: "swiss", id: "main", rounds: 3 }],
        },
        names(9),
        12345,
      );
      driver.runAll(strongerWins);
      return driver.state;
    };

    expect(build()).toEqual(build());
  });
});
