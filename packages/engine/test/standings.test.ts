import { describe, expect, it } from "vitest";
import { computeStandings, stageStandings } from "../src/standings/index.js";
import { buildState, match, played, side } from "./helpers.js";

const order = (rows: { entrantId: string }[]) => rows.map((r) => r.entrantId);

describe("strength of opposition", () => {
  /**
   * The scenario this engine was built to get right.
   *
   * Ana loses narrowly to the two strongest players and beats the two weakest.
   * Luc beats the same two weak players and plays nobody else. Both finish on
   * two wins — but Ana's two wins came alongside a far harder draw, and
   * Buchholz is what says so.
   */
  const petanque = {
    score: { kind: "points" as const, target: 13 },
    standings: {
      pointsSystem: { win: 1, draw: 0, loss: 0 },
      tiebreakers: [
        { key: "wins" as const },
        { key: "buchholz" as const },
        { key: "point_diff" as const },
        { key: "drawn_lot" as const },
      ],
    },
    stages: [{ kind: "swiss" as const, id: "main" }],
  };

  const field = ["champ", "runner", "ana", "luc", "weak1", "weak2"];
  const fixtures = [
    played("m1", "champ", "ana", 13, 11),
    played("m2", "runner", "ana", 13, 12),
    played("m3", "ana", "weak1", 13, 3),
    played("m4", "luc", "weak1", 13, 5),
    played("m5", "luc", "weak2", 13, 7),
    played("m6", "ana", "weak2", 13, 6),
    played("m7", "champ", "weak1", 13, 4),
    played("m8", "runner", "weak2", 13, 6),
    played("m9", "champ", "runner", 13, 9),
  ];

  const rows = stageStandings(buildState(petanque, field, fixtures), "main");

  it("puts the player with three narrow losses to the top seeds above the one who only beat the bottom", () => {
    const ana = rows.find((r) => r.entrantId === "ana");
    const luc = rows.find((r) => r.entrantId === "luc");

    // Both won twice…
    expect(ana?.record.wins).toBe(2);
    expect(luc?.record.wins).toBe(2);
    // …but Ana's opponents were worth far more.
    expect(ana?.metrics.buchholz).toBeGreaterThan(luc?.metrics.buchholz ?? 0);
    expect(ana?.rank).toBeLessThan(luc?.rank ?? 99);
  });

  it("still puts the undefeated player first", () => {
    expect(order(rows)[0]).toBe("champ");
  });

  it("produces a total order with no shared ranks", () => {
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.every((r) => !r.tiedWithNext)).toBe(true);
  });

  it("reports point difference so a narrow loss is visible", () => {
    const ana = rows.find((r) => r.entrantId === "ana");
    expect(ana?.record.pointsFor).toBe(11 + 12 + 13 + 13);
    expect(ana?.record.pointsAgainst).toBe(13 + 13 + 3 + 6);
  });
});

describe("head-to-head", () => {
  it("separates two entrants level on points by the match between them", () => {
    const config = {
      score: { kind: "points" as const, allowDraw: true },
      standings: {
        pointsSystem: { win: 3, draw: 1, loss: 0 },
        tiebreakers: [{ key: "points" as const }, { key: "head_to_head" as const }],
      },
      stages: [{ kind: "round_robin" as const, id: "main" }],
    };

    // A full round robin in which A and B both finish on six points: each won
    // twice and lost once. The only thing between them is that A beat B.
    const rows = stageStandings(
      buildState(config, ["a", "b", "c", "d"], [
        played("m1", "a", "b", 2, 1),
        played("m2", "c", "a", 1, 0),
        played("m3", "a", "d", 3, 0),
        played("m4", "b", "c", 2, 0),
        played("m5", "b", "d", 1, 0),
        played("m6", "d", "c", 2, 1),
      ]),
      "main",
    );

    expect(rows[0]?.record.competitionPoints).toBe(6);
    expect(rows[1]?.record.competitionPoints).toBe(6);
    expect(order(rows).slice(0, 2)).toEqual(["a", "b"]);
    // Head-to-head split them, so they do not share a rank.
    expect(rows[0]?.tiedWithNext).toBe(false);
  });

  it("ignores results against entrants who are no longer tied", () => {
    const config = {
      score: { kind: "points" as const, allowDraw: true },
      standings: {
        pointsSystem: { win: 3, draw: 1, loss: 0 },
        tiebreakers: [{ key: "points" as const }, { key: "head_to_head" as const }],
      },
      stages: [{ kind: "round_robin" as const, id: "main" }],
    };

    const state = buildState(config, ["a", "b", "c"], [
      played("m1", "a", "b", 1, 0),
      played("m2", "b", "c", 5, 0),
      played("m3", "c", "a", 5, 0),
    ]);
    const rows = computeStandings(state, state.matches, ["a", "b", "c"]);

    // A three-way tie on 3 points each that head-to-head cannot break either,
    // because inside the tied set everyone won once.
    expect(rows.every((r) => r.record.competitionPoints === 3)).toBe(true);
    expect(rows.every((r) => r.rank === 1)).toBe(true);
  });
});

describe("byes", () => {
  const config = {
    standings: {
      pointsSystem: { win: 1, draw: 0, loss: 0, bye: 1 },
      tiebreakers: [{ key: "points" as const }, { key: "buchholz" as const }],
    },
    stages: [{ kind: "swiss" as const, id: "main" }],
  };

  const state = buildState(config, ["a", "b", "c"], [
    played("m1", "b", "c", 13, 5),
    match("m2", [side("a"), side(null)], { status: "bye" }),
  ]);
  const rows = stageStandings(state, "main");

  it("awards the configured points and does not count as a match played", () => {
    const a = rows.find((r) => r.entrantId === "a");
    expect(a?.record.byes).toBe(1);
    expect(a?.record.played).toBe(0);
    expect(a?.record.competitionPoints).toBe(1);
  });

  it("does not punish the bye in Buchholz", () => {
    // Counting a bye as a zero-strength opponent would penalise whoever drew
    // the odd number, so it counts as a virtual opponent of equal strength.
    const a = rows.find((r) => r.entrantId === "a");
    expect(a?.metrics.buchholz).toBe(a?.record.competitionPoints);
  });
});

describe("configurable points systems", () => {
  it("awards three for a win, one for a draw", () => {
    const rows = stageStandings(
      buildState(
        {
          score: { kind: "points", allowDraw: true },
          standings: {
            pointsSystem: { win: 3, draw: 1, loss: 0 },
            tiebreakers: [{ key: "points" }, { key: "point_diff" }],
          },
          stages: [{ kind: "round_robin", id: "main" }],
        },
        ["a", "b"],
        [played("m1", "a", "b", 2, 2), played("m2", "a", "b", 3, 1)],
      ),
      "main",
    );
    expect(rows.find((r) => r.entrantId === "a")?.record.competitionPoints).toBe(4);
    expect(rows.find((r) => r.entrantId === "b")?.record.competitionPoints).toBe(1);
  });

  it("supports a three-two-one-zero system decided after regulation", () => {
    const rows = stageStandings(
      buildState(
        {
          score: { kind: "points" },
          standings: {
            pointsSystem: { win: 3, loss: 0, overtimeWin: 2, overtimeLoss: 1 },
            tiebreakers: [{ key: "points" }],
          },
          stages: [{ kind: "round_robin", id: "main" }],
        },
        ["a", "b"],
        [
          match("m1", [side("a"), side("b")], {
            status: "complete",
            result: { kind: "points", scores: [4, 3], overtime: true },
          }),
        ],
      ),
      "main",
    );
    expect(rows.find((r) => r.entrantId === "a")?.record.competitionPoints).toBe(2);
    expect(rows.find((r) => r.entrantId === "b")?.record.competitionPoints).toBe(1);
  });

  it("awards a bonus point for losing narrowly", () => {
    const rows = stageStandings(
      buildState(
        {
          score: { kind: "points" },
          standings: {
            pointsSystem: {
              win: 4,
              loss: 0,
              bonusRules: [
                {
                  id: "losing-bonus",
                  label: "Lost by seven or fewer",
                  condition: { kind: "loss_margin_at_most", value: 7 },
                  points: 1,
                },
              ],
            },
            tiebreakers: [{ key: "points" }],
          },
          stages: [{ kind: "round_robin", id: "main" }],
        },
        ["a", "b", "c"],
        [played("m1", "a", "b", 20, 15), played("m2", "a", "c", 40, 3)],
      ),
      "main",
    );
    expect(rows.find((r) => r.entrantId === "b")?.record.competitionPoints).toBe(1);
    expect(rows.find((r) => r.entrantId === "c")?.record.competitionPoints).toBe(0);
  });

  it("counts what you scored when points come from the scoreline", () => {
    // A free-for-all night: finishing fourth of twelve is still worth something.
    const rows = stageStandings(
      buildState(
        {
          match: { sidesPerMatch: 4 },
          score: { kind: "placement", pointsByPlace: [15, 12, 10, 8] },
          standings: { pointsSource: "score", tiebreakers: [{ key: "points" }] },
          stages: [{ kind: "swiss", id: "main" }],
        },
        ["a", "b", "c", "d"],
        [
          match("r1", [side("a"), side("b"), side("c"), side("d")], {
            status: "complete",
            result: { kind: "placement", places: [[0], [1], [2], [3]] },
          }),
          match("r2", [side("a"), side("b"), side("c"), side("d")], {
            status: "complete",
            result: { kind: "placement", places: [[3], [2], [1], [0]] },
          }),
        ],
      ),
      "main",
    );
    // Everyone took a first and a last, or a second and a third.
    expect(rows.find((r) => r.entrantId === "a")?.record.competitionPoints).toBe(15 + 8);
    expect(rows.find((r) => r.entrantId === "b")?.record.competitionPoints).toBe(12 + 10);
  });
});

describe("reordering tiebreakers changes the table", () => {
  const field = ["a", "b"];
  const fixtures = [
    played("m1", "a", "c", 1, 0),
    played("m2", "b", "c", 5, 0),
  ];

  it("ranks by point difference or by goals scored, as configured", () => {
    const base = {
      score: { kind: "points" as const },
      standings: { pointsSystem: { win: 3, loss: 0 } },
      stages: [{ kind: "round_robin" as const, id: "main" }],
    };

    const byDiff = stageStandings(
      buildState(
        { ...base, standings: { ...base.standings, tiebreakers: [{ key: "points" }, { key: "points_against" as const, direction: "asc" as const }] } },
        field,
        fixtures,
      ),
      "main",
    );
    const byScored = stageStandings(
      buildState(
        { ...base, standings: { ...base.standings, tiebreakers: [{ key: "points" }, { key: "points_for" as const }] } },
        field,
        fixtures,
      ),
      "main",
    );

    // Both won once and conceded nothing, so fewest-conceded cannot split them…
    expect(byDiff.every((r) => r.rank === 1)).toBe(true);
    // …while most-scored puts B first.
    expect(order(byScored)).toEqual(["b", "a"]);
  });
});

describe("voided fixtures", () => {
  it("are excluded from the table entirely", () => {
    const rows = stageStandings(
      buildState(
        { standings: { tiebreakers: [{ key: "points" }] }, stages: [{ kind: "round_robin", id: "main" }] },
        ["a", "b"],
        [played("m1", "a", "b", 13, 0, { status: "void" })],
      ),
      "main",
    );
    expect(rows.every((r) => r.record.played === 0)).toBe(true);
  });
});
