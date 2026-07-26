import { describe, expect, it } from "vitest";
import { computeRatings, expectedScore, marginMultiplier } from "../src/rating/index.js";
import { conservativeRating, drawMargin, trueSkillUpdate } from "../src/rating/trueskill.js";
import { bySeed, Driver, names } from "./tournament.js";

describe("Elo", () => {
  it("gives equal players an even chance", () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 6);
  });

  it("makes a 400-point favourite a ten-to-one shot", () => {
    // The defining property of the scale: 400 points is odds of 10:1.
    expect(expectedScore(1900, 1500)).toBeCloseTo(10 / 11, 6);
    expect(expectedScore(1500, 1900)).toBeCloseTo(1 / 11, 6);
  });

  it("is zero-sum", () => {
    expect(expectedScore(1720, 1480) + expectedScore(1480, 1720)).toBeCloseTo(1, 10);
  });

  it("scales the update by the margin, but not without limit", () => {
    expect(marginMultiplier(1)).toBe(1);
    expect(marginMultiplier(3)).toBeCloseTo(2, 6);
    expect(marginMultiplier(1000)).toBe(3);
    expect(marginMultiplier(-3)).toBeCloseTo(2, 6);
  });

  describe("over a tournament", () => {
    const run = (over: Record<string, unknown> = {}) => {
      const driver = new Driver(
        {
          score: { kind: "points" },
          rating: { system: "elo", initial: 1500, ...over },
          stages: [{ kind: "round_robin", id: "league" }],
        },
        names(4),
      );
      driver.runAll(bySeed);
      return computeRatings(driver.state);
    };

    it("ranks the field by results", () => {
      const ratings = run();
      const order = [...ratings.values()]
        .sort((a, b) => b.rating - a.rating)
        .map((r) => r.entrantId);
      expect(order).toEqual(["p01", "p02", "p03", "p04"]);
    });

    it("conserves rating points across the field", () => {
      const total = [...run().values()].reduce((sum, r) => sum + r.change, 0);
      expect(total).toBeCloseTo(0, 6);
    });

    it("moves ratings further when the margin counts", () => {
      const flat = run({ elo: { marginOfVictory: false } });
      const weighted = run({ elo: { marginOfVictory: true } });
      const gain = (t: ReturnType<typeof run>) => t.get("p01")?.change ?? 0;
      // Winning 13-5 every time is more convincing than winning at all.
      expect(gain(weighted)).toBeGreaterThan(gain(flat));
    });

    it("respects a rating floor", () => {
      const ratings = run({ initial: 1500, elo: { k: 400, floor: 1450 } });
      expect([...ratings.values()].every((r) => r.rating >= 1450)).toBe(true);
    });

    it("counts matches played", () => {
      expect(run().get("p01")?.matchesPlayed).toBe(3);
    });
  });

  it("splits one free-for-all result across the comparisons it implies", () => {
    const driver = new Driver(
      {
        match: { sidesPerMatch: 4 },
        score: { kind: "placement" },
        rating: { system: "elo", initial: 1500 },
        pairing: { strategy: "random" },
        stages: [{ kind: "swiss", id: "heats", rounds: 1 }],
      },
      names(4),
    );
    driver.start("heats");
    for (const match of driver.playable()) {
      driver.report(match.id, { kind: "placement", places: [[0], [1], [2], [3]] });
    }

    const ratings = computeRatings(driver.state);
    const changes = [...ratings.values()].map((r) => r.change);
    // Still zero-sum, and the winner gains while the last-placed loses.
    expect(changes.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 6);
    expect(Math.max(...changes)).toBeGreaterThan(0);
    expect(Math.min(...changes)).toBeLessThan(0);
  });

  it("returns nothing when ratings are switched off", () => {
    const driver = new Driver(
      { rating: { system: "none" }, stages: [{ kind: "round_robin", id: "l" }] },
      names(4),
    );
    driver.runAll(bySeed);
    expect(computeRatings(driver.state).size).toBe(0);
  });

  it("recovers when a result is corrected", () => {
    const build = (scores: [number, number]) => {
      const driver = new Driver(
        {
          score: { kind: "points" },
          rating: { system: "elo", initial: 1500 },
          stages: [{ kind: "round_robin", id: "l" }],
        },
        names(2),
      );
      driver.start("l");
      const match = driver.playable()[0];
      if (match) driver.report(match.id, { kind: "points", scores });
      return driver;
    };

    const wrong = build([5, 13]);
    const match = wrong.state.matches[0];
    // Correcting the scoreline must move the ratings to where they would have
    // been had it been entered correctly the first time.
    if (match) wrong.report(match.id, { kind: "points", scores: [13, 5] });

    expect(computeRatings(wrong.state).get("p01")?.rating).toBeCloseTo(
      computeRatings(build([13, 5]).state).get("p01")?.rating ?? 0,
      10,
    );
  });
});

describe("Glicko-2 over a tournament", () => {
  it("narrows its uncertainty as evidence arrives", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        rating: { system: "glicko2", initial: 1500 },
        stages: [{ kind: "round_robin", id: "league" }],
      },
      names(6),
    );
    driver.runAll(bySeed);

    const ratings = computeRatings(driver.state);
    expect([...ratings.values()].every((r) => (r.deviation ?? 999) < 350)).toBe(true);
    const order = [...ratings.values()].sort((a, b) => b.rating - a.rating).map((r) => r.entrantId);
    expect(order[0]).toBe("p01");
  });
});

describe("TrueSkill", () => {
  const config = { beta: 25 / 6, tau: 25 / 300, drawProbability: 0.1 };
  const fresh = { mu: 25, sigma: 25 / 3 };

  it("moves the winner up and the loser down by the same amount when they are equal", () => {
    const { winner, loser } = trueSkillUpdate(fresh, fresh, config);
    expect(winner.mu).toBeGreaterThan(25);
    expect(loser.mu).toBeLessThan(25);
    expect(winner.mu - 25).toBeCloseTo(25 - loser.mu, 10);
  });

  it("becomes more certain about both after a result", () => {
    const { winner, loser } = trueSkillUpdate(fresh, fresh, config);
    expect(winner.sigma).toBeLessThan(fresh.sigma);
    expect(loser.sigma).toBeLessThan(fresh.sigma);
  });

  it("barely moves a heavy favourite who wins", () => {
    const favourite = { mu: 40, sigma: 2 };
    const outsider = { mu: 10, sigma: 2 };
    const expectedWin = trueSkillUpdate(favourite, outsider, config);
    const upset = trueSkillUpdate(outsider, favourite, config);

    expect(expectedWin.winner.mu - favourite.mu).toBeLessThan(upset.winner.mu - outsider.mu);
  });

  it("brings a draw's participants towards each other", () => {
    const strong = { mu: 35, sigma: 3 };
    const weak = { mu: 15, sigma: 3 };
    const drawn = trueSkillUpdate(strong, weak, config, true);
    expect(drawn.winner.mu).toBeLessThan(35);
    expect(drawn.loser.mu).toBeGreaterThan(15);
  });

  it("has a positive draw margin", () => {
    expect(drawMargin(config)).toBeGreaterThan(0);
    expect(drawMargin({ ...config, drawProbability: 0 })).toBeCloseTo(0, 6);
  });

  it("reports a conservative estimate rather than its best guess", () => {
    expect(conservativeRating(fresh)).toBeLessThan(fresh.mu);
  });

  it("ranks a free-for-all field", () => {
    const driver = new Driver(
      {
        match: { sidesPerMatch: 4 },
        score: { kind: "placement" },
        rating: { system: "trueskill" },
        pairing: { strategy: "random" },
        stages: [{ kind: "swiss", id: "heats", rounds: 2 }],
      },
      names(8),
    );

    driver.start("heats");
    for (let round = 0; round < 2; round += 1) {
      for (const match of driver.playable()) {
        // The lowest-numbered entrant in each heat finishes first.
        const order = match.sides
          .map((s, i) => ({ id: s.entrantId ?? "", i }))
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((s) => [s.i]);
        driver.report(match.id, { kind: "placement", places: order });
      }
      driver.advance("heats");
    }

    const ratings = computeRatings(driver.state);
    expect(ratings.get("p01")?.rating ?? 0).toBeGreaterThan(ratings.get("p08")?.rating ?? 0);
  });
});
