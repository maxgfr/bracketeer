/**
 * Reading a structure by playing it.
 *
 * `readShape` exists so a drawing cannot describe a tournament the rules do not
 * produce: it builds a sample, plays it to the end through the ordinary command
 * API, and reports what actually came out. These tests use plain configurations
 * rather than the shipped presets, because the presets live a layer out — the
 * engine must stay able to answer this question about a config it has never seen.
 */

import { describe, expect, it } from "vitest";
import type { TournamentConfigInput } from "../src/domain/config.js";
import { readShape, sampleCompletes } from "../src/simulate/index.js";

const shapeOf = (config: TournamentConfigInput, entrants = 16) => readShape(config, entrants);

describe("reading a structure", () => {
  it("sees a knockout as a halving tree", () => {
    const shape = shapeOf({ stages: [{ kind: "single_elimination", id: "main" }] });
    const main = shape.stages[0]?.brackets.find((b) => b.slot === "main");

    expect(main?.rounds).toEqual([8, 4, 2, 1]);
    expect(main?.isTree).toBe(true);
  });

  it("sees the second bracket a double elimination carries", () => {
    const shape = shapeOf({ stages: [{ kind: "double_elimination", id: "main" }] });
    const slots = shape.stages[0]?.brackets.map((b) => b.slot) ?? [];

    expect(slots).toContain("main");
    expect(slots).toContain("lower");
  });

  it("sees everyone-plays-everyone as one flat set of rounds, not a tree", () => {
    const shape = shapeOf({ stages: [{ kind: "round_robin", id: "main" }] }, 6);
    const main = shape.stages[0]?.brackets.find((b) => b.slot === "main");

    expect(main?.isTree).toBe(false);
    // Five rounds of three for six entrants.
    expect(main?.rounds).toEqual([3, 3, 3, 3, 3]);
  });

  it("counts the groups, and draws one of them", () => {
    const shape = shapeOf({
      stages: [
        {
          kind: "groups",
          id: "pools",
          groupSize: 4,
          inner: { kind: "round_robin", id: "pool" },
        },
      ],
    });

    expect(shape.stages[0]?.groupCount).toBe(4);
    // One group of four is three rounds of two, not the whole field at once.
    expect(shape.stages[0]?.brackets[0]?.rounds).toEqual([2, 2, 2]);
  });

  it("reports how many come through to the next stage", () => {
    const shape = shapeOf({
      stages: [
        {
          kind: "groups",
          id: "pools",
          groupSize: 4,
          inner: { kind: "round_robin", id: "pool" },
          qualification: { perGroup: 2 },
        },
        { kind: "single_elimination", id: "cut" },
      ],
    });

    expect(shape.stages[0]?.qualifiers).toBe(8);
    expect(shape.stages[1]?.qualifiers).toBeNull();
  });

  it("still describes a ladder, which has no fixtures until somebody challenges", () => {
    const shape = shapeOf({ stages: [{ kind: "ladder", id: "main" }] });

    expect(shape.stages).toHaveLength(1);
    expect(shape.stages[0]?.kind).toBe("ladder");
    expect(shape.stages[0]?.entrants).toBe(16);
  });

  it("carries the match shape through, so a free-for-all does not read as a duel", () => {
    const shape = shapeOf({
      match: { sidesPerMatch: 4 },
      score: { kind: "placement" },
      stages: [{ kind: "round_robin", id: "main" }],
    });

    expect(shape.stages[0]?.sidesPerMatch).toBe(4);
  });
});

describe("proving a configuration finishes", () => {
  it.each([
    ["a knockout", { stages: [{ kind: "single_elimination" as const, id: "main" }] }],
    ["two lives", { stages: [{ kind: "double_elimination" as const, id: "main" }] }],
    ["everyone plays everyone", { stages: [{ kind: "round_robin" as const, id: "main" }] }],
    ["paired by record", { stages: [{ kind: "swiss" as const, id: "main" }] }],
    [
      "groups then a knockout",
      {
        stages: [
          {
            kind: "groups" as const,
            id: "pools",
            groupSize: 4,
            inner: { kind: "round_robin" as const, id: "pool" },
            qualification: { perGroup: 2 },
          },
          { kind: "single_elimination" as const, id: "cut" },
        ],
      },
    ],
  ])("%s plays to the end", (_name, config) => {
    expect(sampleCompletes(config)).toBe(true);
  });

  it("treats a ladder as complete, because it has no end by design", () => {
    expect(sampleCompletes({ stages: [{ kind: "ladder", id: "main" }] })).toBe(true);
  });

  it("plays a scoring kind that is not points", () => {
    expect(
      sampleCompletes({
        score: { kind: "sets", bestOf: 3 },
        stages: [{ kind: "single_elimination", id: "main" }],
      }),
    ).toBe(true);
  });
});
