import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/domain/config.js";
import { normalizeResult, outcomeOfMatch } from "../src/scoring/normalize.js";
import { match, side } from "./helpers.js";

const scoreOf = (input: Parameters<typeof parseConfig>[0]) => parseConfig(input).score;

describe("normalising results", () => {
  it("ranks a points result by score", () => {
    const outcome = normalizeResult(
      { kind: "points", scores: [13, 11] },
      scoreOf({ score: { kind: "points", target: 13 } }),
      2,
    );
    expect(outcome.winner).toBe(0);
    expect(outcome.places).toEqual([[0], [1]]);
    expect(outcome.pointsFor).toEqual([13, 11]);
    expect(outcome.isDraw).toBe(false);
  });

  it("reports a tie on points as a draw", () => {
    const outcome = normalizeResult(
      { kind: "points", scores: [2, 2] },
      scoreOf({ score: { kind: "points", allowDraw: true } }),
      2,
    );
    expect(outcome.isDraw).toBe(true);
    expect(outcome.winner).toBeNull();
    expect(outcome.places).toEqual([[0, 1]]);
  });

  it("counts sets won, not points scored", () => {
    // A tennis scoreline the loser of the match won more games in.
    const outcome = normalizeResult(
      { kind: "sets", sets: [[6, 7], [6, 0], [6, 4]] },
      scoreOf({ score: { kind: "sets", bestOf: 5 } }),
      2,
    );
    expect(outcome.winner).toBe(0);
    expect(outcome.pointsFor).toEqual([2, 1]);
    expect(outcome.rawFor).toEqual([18, 11]);
  });

  it("handles an outcome-only result", () => {
    const config = scoreOf({ score: { kind: "outcome" } });
    expect(normalizeResult({ kind: "outcome", winner: 1 }, config, 2).winner).toBe(1);

    const drawn = normalizeResult({ kind: "outcome", winner: null }, config, 2);
    expect(drawn.isDraw).toBe(true);
    expect(drawn.pointsFor).toBeNull();
  });

  it("ranks a free-for-all by finishing position and awards table points", () => {
    const outcome = normalizeResult(
      { kind: "placement", places: [[2], [0], [3], [1]] },
      scoreOf({
        match: { sidesPerMatch: 4 },
        score: { kind: "placement", pointsByPlace: [15, 12, 10, 8] },
      }),
      4,
    );
    expect(outcome.winner).toBe(2);
    expect(outcome.pointsFor).toEqual([12, 8, 15, 10]);
  });

  it("shares the points of the places tied competitors occupy", () => {
    const outcome = normalizeResult(
      { kind: "placement", places: [[0, 1], [2]] },
      scoreOf({
        match: { sidesPerMatch: 3 },
        score: { kind: "placement", pointsByPlace: [10, 6, 4], allowTies: true },
      }),
      3,
    );
    // First and second place points, split between the two tied competitors.
    expect(outcome.pointsFor).toEqual([8, 8, 4]);
  });

  it("ranks times with the fastest first", () => {
    const outcome = normalizeResult(
      { kind: "time", times: [12.4, 11.9, null] },
      scoreOf({ match: { sidesPerMatch: 3 }, score: { kind: "time" } }),
      3,
    );
    expect(outcome.places).toEqual([[1], [0], [2]]);
    expect(outcome.winner).toBe(1);
  });

  it("ranks by the highest value when higher is better", () => {
    const outcome = normalizeResult(
      { kind: "time", times: [12.4, 11.9] },
      scoreOf({ score: { kind: "time", lowerIsBetter: false } }),
      2,
    );
    expect(outcome.winner).toBe(0);
  });

  it("puts a side that forfeited last, whatever the scoreline says", () => {
    const outcome = normalizeResult(
      { kind: "points", scores: [13, 0], forfeitBy: [0] },
      scoreOf({ score: { kind: "points" } }),
      2,
    );
    expect(outcome.winner).toBe(1);
    expect(outcome.forfeitBy).toEqual([0]);
  });

  it("refuses a result recorded in the wrong shape", () => {
    expect(() =>
      normalizeResult({ kind: "points", scores: [1, 0] }, scoreOf({ score: { kind: "outcome" } }), 2),
    ).toThrow(/scores by "outcome"/);
  });
});

describe("match outcomes", () => {
  const config = scoreOf({});

  it("awards a bye to whoever is present", () => {
    const outcome = outcomeOfMatch(match("m", [side("a"), side(null)], { status: "bye" }), config);
    expect(outcome?.winner).toBe(0);
  });

  it("has no outcome for an unplayed fixture", () => {
    expect(outcomeOfMatch(match("m", [side("a"), side("b")], { status: "ready" }), config)).toBeNull();
  });

  it("has no outcome for a voided fixture, even with a result on it", () => {
    const voided = match("m", [side("a"), side("b")], {
      status: "void",
      result: { kind: "points", scores: [13, 0] },
    });
    expect(outcomeOfMatch(voided, config)).toBeNull();
  });
});
