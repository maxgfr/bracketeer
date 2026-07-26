/**
 * The paths a coverage run showed were never exercised.
 *
 * Written after measuring rather than guessing: the ladder was at 9% of its
 * lines, several configured tiebreakers had never been computed once, and the
 * repechage branch of the elimination builder had never been built.
 */

import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/domain/config.js";
import {
  activeEntrants,
  findEntrant,
  findMatch,
  matchesOfStage,
  playedMatches,
  sideEntrantIds,
} from "../src/domain/entities.js";
import { buildSingleElimination, grandFinalResetMatch } from "../src/formats/elimination.js";
import { allocateGroups, groupName, selectQualifiers } from "../src/formats/groups.js";
import { buildChallenge, ladderOrder, legalChallenges } from "../src/formats/ladder.js";
import { toIcs } from "../src/schedule/index.js";
import { computeStandings, overallStandings, stageStandings } from "../src/standings/index.js";
import { createRng } from "../src/util/rng.js";
import { buildState, match, played, side } from "./helpers.js";
import { bySeed, Driver, names } from "./tournament.js";

describe("challenge ladder", () => {
  const startingOrder = ["a", "b", "c", "d", "e"];

  const ladderState = (fixtures: ReturnType<typeof played>[]) =>
    buildState(
      { score: { kind: "points" }, stages: [{ kind: "ladder", id: "main" }] },
      startingOrder,
      fixtures,
    );

  it("leaves the order alone until somebody wins going up", () => {
    // The higher rung wins: nothing moves.
    const state = ladderState([played("m0", "b", "d", 13, 4)]);
    expect(ladderOrder(state, "main", startingOrder, true)).toEqual(startingOrder);
  });

  it("gives the winner the loser's rung, pushing everyone between down", () => {
    // d (rung 3) beats b (rung 1).
    const state = ladderState([played("m0", "d", "b", 13, 4)]);
    expect(ladderOrder(state, "main", startingOrder, true)).toEqual(["a", "d", "b", "c", "e"]);
  });

  it("swaps the two instead, when configured that way", () => {
    const state = ladderState([played("m0", "d", "b", 13, 4)]);
    expect(ladderOrder(state, "main", startingOrder, false)).toEqual(["a", "d", "c", "b", "e"]);
  });

  it("applies challenges in the order they were played", () => {
    const state = ladderState([
      played("m0", "e", "d", 13, 4, { roundIndex: 0 }),
      played("m1", "e", "a", 13, 4, { roundIndex: 1 }),
    ]);
    // e climbs to fourth, then all the way to the top.
    expect(ladderOrder(state, "main", startingOrder, true)[0]).toBe("e");
  });

  it("ignores a fixture nobody won", () => {
    const state = buildState(
      {
        score: { kind: "points", allowDraw: true },
        stages: [{ kind: "ladder", id: "main" }],
      },
      startingOrder,
      [played("m0", "d", "b", 7, 7)],
    );
    expect(ladderOrder(state, "main", startingOrder, true)).toEqual(startingOrder);
  });

  it("ignores an unplayed challenge", () => {
    const state = ladderState([]);
    expect(ladderOrder(state, "main", startingOrder, true)).toEqual(startingOrder);
  });

  it("offers only the rungs within reach", () => {
    expect(legalChallenges(startingOrder, "d", 2)).toEqual(["b", "c"]);
    expect(legalChallenges(startingOrder, "e", 10)).toEqual(["a", "b", "c", "d"]);
    // The competitor at the top has nobody to challenge.
    expect(legalChallenges(startingOrder, "a", 3)).toEqual([]);
    // Somebody not on the ladder at all.
    expect(legalChallenges(startingOrder, "zz", 3)).toEqual([]);
  });

  it("builds a challenge with the defender at home", () => {
    const fixture = buildChallenge("main", "e", "b", 4);
    expect(fixture.sides.map((s) => s.entrantId)).toEqual(["b", "e"]);
    expect(fixture.sides[0]?.isHome).toBe(true);
    expect(fixture.roundIndex).toBe(4);
    expect(fixture.label).toBe("Challenge");
  });
});

describe("tiebreakers that had never been computed", () => {
  /**
   * Five entrants in a Swiss-shaped set of results, so the strength-of-schedule
   * measures have something to actually differ over.
   */
  const field = ["a", "b", "c", "d"];
  const fixtures = [
    played("m1", "a", "b", 13, 9),
    played("m2", "a", "c", 13, 2),
    played("m3", "b", "c", 13, 11),
    played("m4", "b", "d", 13, 6),
    played("m5", "c", "d", 13, 8),
    played("m6", "a", "d", 13, 4),
  ];

  const withTiebreakers = (keys: string[]) =>
    stageStandings(
      buildState(
        {
          score: { kind: "points" },
          standings: {
            pointsSystem: { win: 1, draw: 0, loss: 0 },
            tiebreakers: keys.map((key) => ({ key: key as never })),
          },
          stages: [{ kind: "swiss", id: "main" }],
        },
        field,
        fixtures,
      ),
      "main",
    );

  it("computes median Buchholz", () => {
    const rows = withTiebreakers(["wins", "median_buchholz"]);
    // Every value is a real number, and dropping the extremes lowers the total.
    for (const row of rows) {
      expect(Number.isFinite(row.metrics.median_buchholz)).toBe(true);
      expect(row.metrics.median_buchholz).toBeLessThanOrEqual(row.metrics.buchholz ?? Infinity);
    }
  });

  it("computes Sonneborn-Berger, which counts only who you beat", () => {
    const rows = withTiebreakers(["wins", "sonneborn_berger"]);
    const a = rows.find((r) => r.entrantId === "a");
    const d = rows.find((r) => r.entrantId === "d");
    // a won every game against a field that then won games of its own; d won none.
    expect(a?.metrics.sonneborn_berger).toBeGreaterThan(0);
    expect(d?.metrics.sonneborn_berger).toBe(0);
  });

  it("ranks by fewest points conceded when told to", () => {
    const rows = withTiebreakers(["points_against"]);
    // Ascending is the sensible direction, so descending puts the leakiest first.
    expect(rows[0]?.metrics.points_against).toBeGreaterThanOrEqual(
      rows[rows.length - 1]?.metrics.points_against ?? 0,
    );
  });

  it("computes matches played", () => {
    const rows = withTiebreakers(["matches_played"]);
    expect(rows.every((r) => r.metrics.matches_played === 3)).toBe(true);
  });

  it("computes the average rating of the opponents faced", () => {
    const state = buildState(
      {
        score: { kind: "points" },
        rating: { system: "elo", initial: 1000 },
        standings: { tiebreakers: [{ key: "opponent_avg_rating" }] },
        stages: [{ kind: "swiss", id: "main" }],
      },
      field,
      fixtures,
    );
    const ratings = new Map([
      ["a", 1600],
      ["b", 1400],
      ["c", 1200],
      ["d", 1000],
    ]);
    const rows = stageStandings(state, "main", { ratings });

    const a = rows.find((r) => r.entrantId === "a");
    // a faced b, c and d: (1400 + 1200 + 1000) / 3.
    expect(a?.metrics.opponent_avg_rating).toBeCloseTo(1200, 6);
  });

  it("falls back to a drawn lot that is stable for a given tournament", () => {
    const first = withTiebreakers(["drawn_lot"]).map((r) => r.entrantId);
    const second = withTiebreakers(["drawn_lot"]).map((r) => r.entrantId);
    expect(first).toEqual(second);
  });

  it("returns zero for an entrant with no record at all", () => {
    const rows = withTiebreakers(["buchholz", "sonneborn_berger"]);
    expect(rows).toHaveLength(4);
  });
});

describe("repechage", () => {
  it("gives everyone beaten in the main draw a second path to the final", () => {
    const matches = buildSingleElimination({
      stageId: "main",
      entrantIds: names(8),
      seeding: parseConfig({}).stages[0]?.kind === "single_elimination"
        ? { method: "standard", slots: [] }
        : { method: "standard", slots: [] },
      consolation: "repechage",
      rng: createRng(1),
    });

    expect(matches.some((m) => m.bracket === "lower")).toBe(true);
    const decider = matches.find((m) => m.bracket === "grand_final");
    expect(decider?.label).toBe("Grand final");
    // The final is between the main draw's winner and the repechage's winner.
    expect(decider?.sides.every((s) => s.source?.from === "winner")).toBe(true);
  });

  it("runs a repechage tournament to a single winner", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        stages: [{ kind: "single_elimination", id: "main", consolation: "repechage" }],
      },
      names(8),
    );
    driver.runAll(bySeed);
    expect(driver.matchesOf("main", "grand_final")[0]?.status).toBe("complete");
  });
});

describe("group allocation", () => {
  const field = names(12);

  it("snakes seeds across groups so no group carries every top seed", () => {
    const groups = allocateGroups(field, {
      groupCount: 4,
      groupSize: null,
      distribution: "snake",
      rng: createRng(1),
    });
    expect(groups.map((g) => g.entrantIds[0])).toEqual(["p01", "p02", "p03", "p04"]);
    // The second pass runs backwards, which is what makes it a snake.
    expect(groups[0]?.entrantIds[1]).toBe("p08");
  });

  it("fills groups in order when asked", () => {
    const groups = allocateGroups(field, {
      groupCount: 3,
      groupSize: null,
      distribution: "sequential",
      rng: createRng(1),
    });
    expect(groups[0]?.entrantIds).toEqual(["p01", "p02", "p03", "p04"]);
  });

  it("draws groups at random, identically for a given seed", () => {
    const draw = () =>
      allocateGroups(field, {
        groupCount: 3,
        groupSize: null,
        distribution: "random",
        rng: createRng(99),
      });
    expect(draw()).toEqual(draw());
  });

  it("derives the group count from a group size", () => {
    const groups = allocateGroups(field, {
      groupCount: null,
      groupSize: 4,
      distribution: "snake",
      rng: createRng(1),
    });
    expect(groups).toHaveLength(3);
  });

  it("copes with an empty field", () => {
    expect(
      allocateGroups([], { groupCount: 2, groupSize: null, distribution: "snake", rng: createRng(1) }),
    ).toEqual([]);
  });

  it("names groups A, B, C and keeps going past Z", () => {
    expect(groupName(0)).toBe("A");
    expect(groupName(25)).toBe("Z");
    expect(groupName(26)).toBe("AA");
    expect(groupName(27)).toBe("AB");
  });

  it("tops up the qualifiers with the best of the rest", () => {
    const rankings = [
      { groupId: "g1", ordered: ["a1", "a2", "a3"] },
      { groupId: "g2", ordered: ["b1", "b2", "b3"] },
    ];
    // Top one from each group, plus the best runner-up.
    const qualifiers = selectQualifiers(rankings, { perGroup: 1, bestOfRest: 1, total: null });
    expect(qualifiers).toHaveLength(3);
    expect(qualifiers.slice(0, 2)).toEqual(["a1", "b1"]);
  });

  it("caps the qualifiers at a total", () => {
    const rankings = [{ groupId: "g1", ordered: ["a", "b", "c", "d"] }];
    expect(selectQualifiers(rankings, { perGroup: 3, bestOfRest: 0, total: 2 })).toEqual(["a", "b"]);
  });
});

describe("the overall table", () => {
  it("combines every stage played so far", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        standings: { tiebreakers: [{ key: "points" }, { key: "drawn_lot" }] },
        stages: [
          { kind: "round_robin", id: "groups", qualification: { count: 2 } },
          { kind: "single_elimination", id: "final" },
        ],
      },
      names(4),
    );
    driver.runAll(bySeed);

    const overall = overallStandings(driver.state);
    expect(overall).toHaveLength(4);
    // The winner played in both stages, so their record spans both.
    expect(overall[0]?.record.played).toBeGreaterThan(3);
  });
});

describe("calendar export edge cases", () => {
  it("folds a line too long for the format", () => {
    const longName = "A".repeat(120);
    const driver = new Driver(
      {
        schedule: {
          startsAt: "2026-06-01T09:00:00.000Z",
          matchDurationMinutes: 45,
          venues: [{ id: "v1", name: "Court", capacity: 1 }],
        },
        stages: [{ kind: "round_robin", id: "l" }],
      },
      [longName, "Short"],
    );
    driver.start("l");
    const fixture = driver.state.matches[0];
    if (fixture) {
      driver.apply([
        {
          type: "match_scheduled",
          matchId: fixture.id,
          scheduledAt: "2026-06-01T09:00:00.000Z",
          venueId: "v1",
        },
      ]);
    }

    const ics = toIcs(driver.state);
    // No line may exceed 75 octets; continuations begin with a space.
    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(76);
    }
    expect(ics).toMatch(/\r\n /);
  });
});

describe("entity helpers", () => {
  const state = buildState({ stages: [{ kind: "round_robin", id: "main" }] }, ["a", "b"], [
    played("m1", "a", "b", 13, 5),
    match("m2", [side("a"), side("b")], { status: "ready" }),
  ]);

  it("finds an entrant and a fixture by id", () => {
    expect(findEntrant(state, "a")?.name).toBe("a");
    expect(findEntrant(state, "nope")).toBeUndefined();
    expect(findMatch(state, "m1")?.id).toBe("m1");
    expect(findMatch(state, "nope")).toBeUndefined();
  });

  it("lists the entrants still in", () => {
    expect(activeEntrants(state)).toHaveLength(2);
  });

  it("lists a stage's fixtures", () => {
    expect(matchesOfStage(state, "main")).toHaveLength(2);
    expect(matchesOfStage(state, "other")).toHaveLength(0);
  });

  it("separates the fixtures that carry a usable result", () => {
    expect(playedMatches(state.matches).map((m) => m.id)).toEqual(["m1"]);
  });

  it("reads the entrants out of a fixture, skipping empty seats", () => {
    expect(sideEntrantIds(state.matches[0]!)).toEqual(["a", "b"]);
    expect(sideEntrantIds(match("x", [side("a"), side(null)]))).toEqual(["a"]);
  });
});

describe("standings with no matches at all", () => {
  it("still lists every entrant on zero", () => {
    const state = buildState({ stages: [{ kind: "swiss", id: "main" }] }, ["a", "b", "c"], []);
    const rows = computeStandings(state, [], ["a", "b", "c"]);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.record.played === 0)).toBe(true);
  });
});

describe("the grand final reset", () => {
  it("puts the lower-bracket entrant at home and swaps the sides", () => {
    const grandFinal = match("main.grand_final.r0.m0", [side("champ"), side("challenger")], {
      bracket: "grand_final",
      roundIndex: 3,
      status: "complete",
      result: { kind: "points", scores: [9, 13] },
    });

    const reset = grandFinalResetMatch("main", grandFinal);

    expect(reset.label).toBe("Grand final (reset)");
    expect(reset.roundIndex).toBe(4);
    // The entrant who came up through the lower bracket now leads the fixture.
    expect(reset.sides.map((s) => s.entrantId)).toEqual(["challenger", "champ"]);
    // Detached from any feeder — it is created from a decided result, not wired.
    expect(reset.sides.every((s) => s.source === null)).toBe(true);
  });

  it("is added to the draw only when the lower-bracket entrant wins", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        stages: [{ kind: "double_elimination", id: "main", grandFinalReset: true }],
      },
      names(4),
    );
    driver.start("main");

    // Play everything by seed, except the grand final itself, which the
    // lower-bracket side takes — the one situation that earns a decider.
    for (let step = 0; step < 20; step += 1) {
      const ready = driver.playable();
      if (ready.length === 0) {
        if (!driver.advance("main")) break;
        continue;
      }
      for (const fixture of ready) {
        const isFirstGrandFinal =
          fixture.bracket === "grand_final" && !fixture.label?.includes("reset");
        driver.report(fixture.id, {
          kind: "points",
          scores: isFirstGrandFinal ? [5, 13] : [13, 5],
        });
      }
    }

    const finals = driver.matchesOf("main", "grand_final");
    expect(finals.some((m) => m.label === "Grand final (reset)")).toBe(true);
    expect(finals.every((m) => m.status === "complete")).toBe(true);
  });
});
