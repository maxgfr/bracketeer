/**
 * The sport presets are shortcuts, not a second concept. These tests hold that
 * line: each one must be a real shape with settings filled in, must parse, must
 * play to the end, and must not have quietly become the thing the engine spent
 * its whole design avoiding.
 */

import { parseConfig, safeParseConfig } from "@bracketeer/engine";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../src/lib/examples.js";
import { readShape, sampleCompletes } from "../src/lib/shape.js";
import { findSport, SPORTS } from "../src/lib/sports.js";

describe("sport presets", () => {
  it.each(SPORTS.map((s) => [s.id, s] as const))("%s is a valid rule set", (_id, sport) => {
    const result = safeParseConfig(sport.config);
    expect(result.success, JSON.stringify(result.error?.issues, null, 2)).toBe(true);
  });

  it.each(SPORTS.map((s) => [s.id, s] as const))("%s names the shape it is", (_id, sport) => {
    // The relationship has to stay visible, or these become modes by stealth.
    expect(EXAMPLES.some((e) => e.name === sport.basedOn), `${sport.basedOn} is not a shape`).toBe(
      true,
    );
  });

  it.each(SPORTS.map((s) => [s.id, s] as const))("%s plays to the end", (_id, sport) => {
    const parsed = parseConfig(sport.config);
    if (parsed.stages.every((s) => s.kind === "ladder")) return;
    expect(sampleCompletes(sport.config)).toBe(true);
  });

  it.each(SPORTS.map((s) => [s.id, s] as const))("%s can be drawn", (_id, sport) => {
    const shape = readShape(sport.config);
    expect(shape.stages.length).toBeGreaterThan(0);
  });

  it("really is the shape it claims, structurally", () => {
    // Same structure as the shape it names, since only the scoring differs.
    for (const sport of SPORTS) {
      const shape = EXAMPLES.find((e) => e.name === sport.basedOn);
      if (!shape) continue;

      const kinds = (config: Parameters<typeof parseConfig>[0]) =>
        parseConfig(config).stages.map((s) => s.kind);

      expect(kinds(sport.config), `${sport.name} vs ${sport.basedOn}`).toEqual(kinds(shape.config));
    }
  });

  it("covers every way of scoring, so the list is not all one kind of game", () => {
    const kinds = new Set(SPORTS.map((s) => parseConfig(s.config).score.kind));
    expect(kinds).toEqual(new Set(["points", "sets", "outcome", "placement", "time"]));
  });

  it("spans team games, individual games and video games", () => {
    expect(SPORTS.length).toBeGreaterThanOrEqual(15);
    expect(SPORTS.some((s) => parseConfig(s.config).entrant.kind === "fixed_team")).toBe(true);
    expect(SPORTS.some((s) => parseConfig(s.config).match.sidesPerMatch > 2)).toBe(true);
  });

  it("gets the rugby bonus points right", () => {
    const rugby = parseConfig(findSport("rugby")!.config);
    expect(rugby.standings.pointsSystem.win).toBe(4);
    expect(rugby.standings.pointsSystem.draw).toBe(2);

    const losing = rugby.standings.pointsSystem.bonusRules.find((r) => r.id === "losing");
    expect(losing?.condition).toEqual({ kind: "loss_margin_at_most", value: 7 });
    expect(losing?.points).toBe(1);
  });

  it("gets the three-two-one-zero system right", () => {
    const hockey = parseConfig(findSport("ice-hockey")!.config).standings.pointsSystem;
    expect([hockey.win, hockey.overtimeWin, hockey.overtimeLoss, hockey.loss]).toEqual([3, 2, 1, 0]);
  });

  it("gets the set targets right", () => {
    const setTarget = (id: string) => {
      const score = parseConfig(findSport(id)!.config).score;
      return score.kind === "sets" ? [score.bestOf, score.setTarget, score.setWinBy] : null;
    };

    expect(setTarget("volleyball")).toEqual([5, 25, 2]);
    expect(setTarget("badminton")).toEqual([3, 21, 2]);
    expect(setTarget("table-tennis")).toEqual([5, 11, 2]);
    expect(setTarget("tennis")).toEqual([3, 6, 2]);
  });

  it("plays pétanque to thirteen, in pairs, with a second draw", () => {
    const config = parseConfig(findSport("petanque")!.config);
    expect(config.score.kind === "points" && config.score.target).toBe(13);
    expect(config.entrant.kind === "fixed_team" && config.entrant.teamSize).toBe(2);

    const knockout = config.stages[1];
    expect(knockout?.kind === "single_elimination" && knockout.consolation).toBe(
      "full_consolation",
    );
  });

  it("has unique ids and names", () => {
    expect(new Set(SPORTS.map((s) => s.id)).size).toBe(SPORTS.length);
    expect(new Set(SPORTS.map((s) => s.name)).size).toBe(SPORTS.length);
  });
});
