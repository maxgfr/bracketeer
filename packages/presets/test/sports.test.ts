/**
 * The sport presets are shortcuts, not a second concept. These tests hold that
 * line: each one must be a real shape with settings filled in, must parse, must
 * play to the end, and must not have quietly become the thing the engine spent
 * its whole design avoiding.
 */

import { parseConfig, readShape, safeParseConfig, sampleCompletes } from "@bracketeer/engine";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../src/examples.js";
import { ALL_FORMATS, findFormat, SPORTS } from "../src/sports.js";

describe("sport presets", () => {
  it.each(ALL_FORMATS.map((f) => [f.id, f] as const))("%s is a valid rule set", (_id, format) => {
    const result = safeParseConfig(format.config);
    expect(result.success, JSON.stringify(result.error?.issues, null, 2)).toBe(true);
  });

  it.each(ALL_FORMATS.map((f) => [f.id, f] as const))("%s names the shape it is", (_id, format) => {
    // The relationship has to stay visible, or these become modes by stealth.
    expect(EXAMPLES.some((e) => e.name === format.basedOn), `${format.basedOn} is not a shape`).toBe(
      true,
    );
  });

  it.each(ALL_FORMATS.map((f) => [f.id, f] as const))("%s plays to the end", (_id, format) => {
    const parsed = parseConfig(format.config);
    if (parsed.stages.every((s) => s.kind === "ladder")) return;
    expect(sampleCompletes(format.config)).toBe(true);
  });

  it.each(ALL_FORMATS.map((f) => [f.id, f] as const))("%s can be drawn", (_id, format) => {
    const shape = readShape(format.config);
    expect(shape.stages.length).toBeGreaterThan(0);
  });

  it("really is the shape it claims, structurally", () => {
    // Same structure as the shape it names, since only the scoring differs.
    for (const entry of ALL_FORMATS) {
      const shape = EXAMPLES.find((e) => e.name === entry.basedOn);
      if (!shape) continue;

      const kinds = (config: Parameters<typeof parseConfig>[0]) =>
        parseConfig(config).stages.map((stage) => stage.kind);

      expect(kinds(entry.config), `${entry.name} vs ${entry.basedOn}`).toEqual(
        kinds(shape.config),
      );
    }
  });

  it("covers every way of scoring, so the list is not all one kind of game", () => {
    const kinds = new Set(ALL_FORMATS.map((entry) => parseConfig(entry.config).score.kind));
    expect(kinds).toEqual(new Set(["points", "sets", "outcome", "placement", "time"]));
  });

  it("spans team games, individual games and video games", () => {
    expect(SPORTS.length).toBeGreaterThanOrEqual(12);
    expect(ALL_FORMATS.length).toBeGreaterThanOrEqual(25);
    expect(
      ALL_FORMATS.some((entry) => parseConfig(entry.config).entrant.kind === "fixed_team"),
    ).toBe(true);
    expect(
      ALL_FORMATS.some((entry) => parseConfig(entry.config).match.sidesPerMatch > 2),
    ).toBe(true);
  });

  it("gets the rugby bonus points right", () => {
    const rugby = parseConfig(findFormat("rugby-season")!.config);
    expect(rugby.standings.pointsSystem.win).toBe(4);
    expect(rugby.standings.pointsSystem.draw).toBe(2);

    const losing = rugby.standings.pointsSystem.bonusRules.find((r) => r.id === "losing");
    expect(losing?.condition).toEqual({ kind: "loss_margin_at_most", value: 7 });
    expect(losing?.points).toBe(1);
  });

  it("gets the three-two-one-zero system right", () => {
    const hockey = parseConfig(findFormat("ice-hockey-season")!.config).standings.pointsSystem;
    expect([hockey.win, hockey.overtimeWin, hockey.overtimeLoss, hockey.loss]).toEqual([3, 2, 1, 0]);
  });

  it("gets the set targets right", () => {
    const setTarget = (id: string) => {
      const score = parseConfig(findFormat(id)!.config).score;
      return score.kind === "sets" ? [score.bestOf, score.setTarget, score.setWinBy] : null;
    };

    expect(setTarget("volleyball-league")).toEqual([5, 25, 2]);
    expect(setTarget("badminton-draw")).toEqual([3, 21, 2]);
    expect(setTarget("table-tennis-groups")).toEqual([5, 11, 2]);
    expect(setTarget("tennis-draw")).toEqual([3, 6, 2]);
  });

  it("plays pétanque to thirteen, in pairs, with a second draw", () => {
    const config = parseConfig(findFormat("petanque-poules")!.config);
    expect(config.score.kind === "points" && config.score.target).toBe(13);
    expect(config.entrant.kind === "fixed_team" && config.entrant.teamSize).toBe(2);

    const knockout = config.stages[1];
    expect(knockout?.kind === "single_elimination" && knockout.consolation).toBe(
      "full_consolation",
    );
  });

  it("has unique ids and names", () => {
    expect(new Set(SPORTS.map((s) => s.id)).size).toBe(SPORTS.length);
    expect(new Set(ALL_FORMATS.map((f) => f.id)).size).toBe(ALL_FORMATS.length);
  });
});
