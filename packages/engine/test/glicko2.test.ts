import { describe, expect, it } from "vitest";
import { glicko2Update } from "../src/rating/glicko2.js";
import { cdf, invCdf, pdf } from "../src/rating/gaussian.js";

describe("Glicko-2", () => {
  /**
   * The worked example from Glickman's own paper: a player rated 1500 with a
   * deviation of 200 plays three opponents, winning the first and losing the
   * other two. Checking against the published numbers is the only way to be
   * confident the volatility solver is right.
   */
  it("reproduces the published worked example", () => {
    const result = glicko2Update(
      { rating: 1500, deviation: 200, volatility: 0.06 },
      [
        { opponent: { rating: 1400, deviation: 30, volatility: 0.06 }, score: 1 },
        { opponent: { rating: 1550, deviation: 100, volatility: 0.06 }, score: 0 },
        { opponent: { rating: 1700, deviation: 300, volatility: 0.06 }, score: 0 },
      ],
      0.5,
    );

    expect(result.rating).toBeCloseTo(1464.06, 1);
    expect(result.deviation).toBeCloseTo(151.52, 1);
    expect(result.volatility).toBeCloseTo(0.05999, 4);
  });

  it("grows the deviation of somebody who did not play", () => {
    const idle = glicko2Update({ rating: 1500, deviation: 50, volatility: 0.06 }, [], 0.5);
    expect(idle.rating).toBe(1500);
    expect(idle.deviation).toBeGreaterThan(50);
  });

  it("moves a certain rating less than an uncertain one", () => {
    const opponent = { rating: 1500, deviation: 30, volatility: 0.06 };
    const established = glicko2Update({ rating: 1500, deviation: 30, volatility: 0.06 }, [
      { opponent, score: 1 },
    ], 0.5);
    const newcomer = glicko2Update({ rating: 1500, deviation: 350, volatility: 0.06 }, [
      { opponent, score: 1 },
    ], 0.5);

    expect(newcomer.rating - 1500).toBeGreaterThan(established.rating - 1500);
  });

  it("shrinks the deviation of somebody who plays", () => {
    const after = glicko2Update({ rating: 1500, deviation: 350, volatility: 0.06 }, [
      { opponent: { rating: 1500, deviation: 30, volatility: 0.06 }, score: 1 },
    ], 0.5);
    expect(after.deviation).toBeLessThan(350);
  });
});

describe("gaussian helpers", () => {
  it("matches known values of the normal distribution", () => {
    expect(pdf(0)).toBeCloseTo(0.3989423, 6);
    expect(cdf(0)).toBeCloseTo(0.5, 6);
    expect(cdf(1.96)).toBeCloseTo(0.975, 4);
    expect(cdf(-1.96)).toBeCloseTo(0.025, 4);
  });

  it("inverts the CDF", () => {
    expect(invCdf(0.975)).toBeCloseTo(1.959964, 4);
    expect(invCdf(0.5)).toBeCloseTo(0, 6);
    for (const p of [0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
      expect(cdf(invCdf(p))).toBeCloseTo(p, 5);
    }
  });
});
