import { describe, expect, it } from "vitest";
import { parseConfig, safeParseConfig } from "../src/domain/config.js";

describe("configuration", () => {
  it("produces a runnable tournament from nothing at all", () => {
    const config = parseConfig({});
    expect(config.entrant.kind).toBe("individual");
    expect(config.match.sidesPerMatch).toBe(2);
    expect(config.score.kind).toBe("points");
    expect(config.stages).toHaveLength(1);
    expect(config.stages[0]?.kind).toBe("single_elimination");
    expect(config.standings.tiebreakers.at(-1)?.key).toBe("drawn_lot");
  });

  it("lets a caller specify only the deltas they care about", () => {
    const config = parseConfig({ score: { kind: "points", target: 13 } });
    expect(config.score).toMatchObject({ kind: "points", target: 13, allowDraw: false });
  });

  describe("composes real formats without any sport-specific code", () => {
    it("a pétanque concours", () => {
      const config = parseConfig({
        score: { kind: "points", target: 13 },
        pairing: { strategy: "closest_record" },
        standings: {
          pointsSystem: { win: 1, loss: 0, draw: 0 },
          tiebreakers: [
            { key: "wins" },
            { key: "buchholz" },
            { key: "point_diff" },
            { key: "drawn_lot" },
          ],
        },
        stages: [{ kind: "swiss", id: "main", rounds: 4 }],
      });

      expect(config.pairing.strategy).toBe("closest_record");
      expect(config.standings.tiebreakers.map((t) => t.key)).toEqual([
        "wins",
        "buchholz",
        "point_diff",
        "drawn_lot",
      ]);
    });

    it("a football league with home and away", () => {
      const config = parseConfig({
        match: { hasHomeSide: true },
        score: { kind: "points", allowDraw: true },
        standings: {
          pointsSystem: { win: 3, draw: 1, loss: 0 },
          tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "points_for" }],
        },
        stages: [{ kind: "round_robin", id: "season", legs: 2 }],
      });

      const stage = config.stages[0];
      expect(stage?.kind === "round_robin" && stage.legs).toBe(2);
      expect(config.standings.pointsSystem.win).toBe(3);
    });

    it("a free-for-all night scored by finishing position", () => {
      const config = parseConfig({
        match: { sidesPerMatch: 4 },
        score: { kind: "placement", pointsByPlace: [15, 12, 10, 8] },
        stages: [{ kind: "swiss", id: "heats", rounds: 6 }],
      });

      expect(config.match.sidesPerMatch).toBe(4);
      expect(config.score.kind === "placement" && config.score.pointsByPlace).toEqual([
        15, 12, 10, 8,
      ]);
    });

    it("a knockout with a bracket for early losers", () => {
      const config = parseConfig({
        stages: [{ kind: "single_elimination", id: "main", consolation: "full_consolation" }],
      });
      const stage = config.stages[0];
      expect(stage?.kind === "single_elimination" && stage.consolation).toBe(
        "full_consolation",
      );
    });

    it("groups feeding a knockout", () => {
      const config = parseConfig({
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
      });
      expect(config.stages).toHaveLength(2);
      expect(config.stages[0]?.qualification.perGroup).toBe(2);
    });
  });

  it("rejects a tournament with no stages", () => {
    const result = safeParseConfig({ stages: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown structure rather than silently ignoring it", () => {
    const result = safeParseConfig({ stages: [{ kind: "battle_royale" }] });
    expect(result.success).toBe(false);
  });
});
