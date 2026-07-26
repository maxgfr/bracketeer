/**
 * The diagrams are traced from a sample tournament the engine actually plays,
 * so these tests check the tracing — if `readShape` reports a structure the
 * engine did not produce, every drawing on the chooser is a lie.
 */

import { parseConfig } from "@bracketeer/engine";
import { describe, expect, it } from "vitest";
import { EXAMPLES, findExample } from "../src/lib/examples.js";
import { readShape, sampleCompletes } from "../src/lib/shape.js";

const shapeOf = (id: string) => readShape(findExample(id)!.config);

describe("reading a shape from the engine", () => {
  it("sees a knockout as a halving tree", () => {
    const shape = shapeOf("knockout");
    const main = shape.stages[0]?.brackets.find((b) => b.slot === "main");

    // Sixteen entrants: 8, 4, 2, 1.
    expect(main?.rounds).toEqual([8, 4, 2, 1]);
    expect(main?.isTree).toBe(true);
  });

  it("sees the second draw as a bracket of its own", () => {
    const shape = shapeOf("knockout-second-chance");
    const slots = shape.stages[0]?.brackets.map((b) => b.slot);

    expect(slots).toContain("main");
    expect(slots).toContain("consolation");

    // Eight first-round losers, so the second draw halves from four.
    const consolation = shape.stages[0]?.brackets.find((b) => b.slot === "consolation");
    expect(consolation?.rounds).toEqual([4, 2, 1]);
  });

  it("sees two lives as an upper and a lower bracket", () => {
    const shape = shapeOf("two-lives");
    const slots = shape.stages[0]?.brackets.map((b) => b.slot) ?? [];

    expect(slots).toContain("main");
    expect(slots).toContain("lower");
    expect(slots).toContain("grand_final");
  });

  it("sees a round robin as rounds that feed nothing", () => {
    const shape = shapeOf("all-play-all");
    const main = shape.stages[0]?.brackets.find((b) => b.slot === "main");

    // Fifteen rounds of eight for sixteen entrants, and nothing carries forward.
    expect(main?.rounds).toHaveLength(15);
    expect(main?.rounds.every((n) => n === 8)).toBe(true);
    expect(main?.isTree).toBe(false);
  });

  it("sees record pairing as a fixed number of drawn rounds", () => {
    const shape = shapeOf("paired-by-record");
    const main = shape.stages[0]?.brackets.find((b) => b.slot === "main");

    // ceil(log2(16)) rounds, each pairing the whole field.
    expect(main?.rounds).toHaveLength(4);
    expect(main?.isTree).toBe(false);
  });

  it("sees groups, and how many come through them", () => {
    const shape = shapeOf("groups-then-knockout");

    expect(shape.stages).toHaveLength(2);
    expect(shape.stages[0]?.groupCount).toBe(4);
    // Two from each of four groups.
    expect(shape.stages[0]?.qualifiers).toBe(8);
    expect(shape.stages[1]?.groupCount).toBe(0);
  });

  it("sees the pools shape as groups feeding a knockout with a second draw", () => {
    const shape = shapeOf("pools-then-knockout");

    expect(shape.stages[0]?.groupCount).toBe(4);
    expect(shape.stages[0]?.qualifiers).toBe(8);
    expect(shape.stages[1]?.brackets.map((b) => b.slot)).toContain("consolation");
  });

  it("sees a stepladder as one fixture per round", () => {
    const shape = shapeOf("climb");
    const main = shape.stages[0]?.brackets.find((b) => b.slot === "main");

    expect(main?.rounds.every((n) => n === 1)).toBe(true);
    expect(main?.isTree).toBe(true);
  });

  it("sees the four-way finish as two, then one, then one", () => {
    const shape = shapeOf("four-way-finish");
    const main = shape.stages[0]?.brackets.find((b) => b.slot === "main");
    expect(main?.rounds).toEqual([2, 1, 1]);
  });

  it("carries the number of sides through, so a heat is not drawn as a duel", () => {
    expect(shapeOf("heats").stages[0]?.sidesPerMatch).toBe(4);
    expect(shapeOf("timed").stages[0]?.sidesPerMatch).toBe(6);
    expect(shapeOf("knockout").stages[0]?.sidesPerMatch).toBe(2);
  });

  it("still describes a ladder, which has no fixtures until somebody challenges", () => {
    const shape = shapeOf("ladder");
    expect(shape.stages).toHaveLength(1);
    expect(shape.stages[0]?.kind).toBe("ladder");
  });
});

describe("every shape can be drawn, and the drawing is real", () => {
  it.each(EXAMPLES.map((e) => [e.id, e] as const))("%s produces a structure", (_id, example) => {
    const shape = readShape(example.config);

    expect(shape.stages.length).toBeGreaterThan(0);
    for (const stage of shape.stages) {
      expect(stage.entrants).toBeGreaterThan(0);
      // Ladders aside, a stage that produced no fixtures would be drawn blank.
      if (stage.kind !== "ladder") {
        expect(stage.brackets.length, `${example.name}: ${stage.id} has no fixtures`).toBeGreaterThan(0);
        for (const bracket of stage.brackets) {
          expect(bracket.rounds.length).toBeGreaterThan(0);
          expect(bracket.rounds.every((n) => n > 0)).toBe(true);
        }
      }
    }
  });

  it.each(EXAMPLES.map((e) => [e.id, e] as const))(
    "%s is traced from a tournament that finished",
    (_id, example) => {
      // A diagram drawn from a deadlocked sample would show a structure nobody
      // can actually play.
      expect(sampleCompletes(example.config)).toBe(true);
    },
  );

  it("has a stage count matching the configuration", () => {
    for (const example of EXAMPLES) {
      const configured = parseConfig(example.config).stages.length;
      expect(readShape(example.config).stages.length, example.name).toBe(configured);
    }
  });

  it("is cheap enough to draw a whole list of them", () => {
    const started = performance.now();
    for (const example of EXAMPLES) readShape(example.config);
    // The chooser renders every shape at once, on a phone.
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
