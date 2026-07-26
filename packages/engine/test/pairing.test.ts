import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/domain/config.js";
import {
  bergerByes,
  bergerLegs,
  bergerRounds,
  bracketSize,
  buildHistory,
  emptyHistory,
  pairKey,
  pairRound,
  seedIntoBracket,
  seedOrder,
  type PairingRequest,
} from "../src/pairing/index.js";
import { createRng } from "../src/util/rng.js";
import { played } from "./helpers.js";

const pairing = (over: Record<string, unknown> = {}) =>
  parseConfig({ pairing: over }).pairing;

function request(
  entrantIds: string[],
  over: Partial<PairingRequest> = {},
): PairingRequest {
  return {
    entrantIds,
    sidesPerMatch: 2,
    config: pairing(),
    history: emptyHistory(),
    points: new Map(),
    ratings: new Map(),
    meta: new Map(),
    rng: createRng(1),
    ...over,
  };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("bracket seeding", () => {
  it("keeps the top seeds apart until the end", () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("rounds the field up to a power of two", () => {
    expect(bracketSize(8)).toBe(8);
    expect(bracketSize(9)).toBe(16);
    expect(bracketSize(1)).toBe(1);
  });

  it("gives the byes to the strongest entrants", () => {
    const slots = seedIntoBracket(ids(5), "standard", createRng(1));
    expect(slots).toHaveLength(8);
    // Seed 1 faces an empty seat; the two lowest seeds have to play.
    expect(slots[0]).toBe("p1");
    expect(slots[1]).toBeNull();
  });

  it("fills slots in listed order when asked to", () => {
    expect(seedIntoBracket(ids(4), "ordered", createRng(1))).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("honours a manual draw", () => {
    const slots = seedIntoBracket(ids(4), "manual", createRng(1), ["p3", "p1", "p4", "p2"]);
    expect(slots).toEqual(["p3", "p1", "p4", "p2"]);
  });

  it("draws the same bracket from the same seed every time", () => {
    const a = seedIntoBracket(ids(8), "random", createRng(99));
    const b = seedIntoBracket(ids(8), "random", createRng(99));
    expect(a).toEqual(b);
  });
});

describe("Berger tables", () => {
  it("has everyone meet everyone exactly once", () => {
    const field = ids(6);
    const rounds = bergerRounds(field);
    expect(rounds).toHaveLength(5);

    const met = new Set<string>();
    for (const round of rounds) {
      for (const [a, b] of round) met.add(pairKey(a, b));
    }
    expect(met.size).toBe((6 * 5) / 2);
  });

  it("has each entrant play once per round", () => {
    for (const round of bergerRounds(ids(8))) {
      const playing = round.flat();
      expect(new Set(playing).size).toBe(playing.length);
      expect(playing).toHaveLength(8);
    }
  });

  it("stands exactly one entrant down each round when the field is odd", () => {
    const field = ids(7);
    const byes = bergerByes(field);
    expect(byes).toHaveLength(7);
    expect(new Set(byes).size).toBe(7); // everyone sits out exactly once
    for (const round of bergerRounds(field)) {
      expect(round).toHaveLength(3);
    }
  });

  it("mirrors home and away in the second leg", () => {
    const legs = bergerLegs(ids(4), 2, true);
    expect(legs).toHaveLength(6);
    const first = legs[0]?.[0];
    const mirrored = legs[3]?.[0];
    expect(mirrored).toEqual([first?.[1], first?.[0]]);
  });

  it("repeats the same fixture orientation when mirroring is off", () => {
    const legs = bergerLegs(ids(4), 2, false);
    expect(legs[0]).toEqual(legs[3]);
  });

  it("meets everyone twice over two legs", () => {
    const counts = new Map<string, number>();
    for (const round of bergerLegs(ids(6), 2, true)) {
      for (const [a, b] of round) {
        const key = pairKey(a, b);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect([...counts.values()].every((c) => c === 2)).toBe(true);
  });
});

describe("seeded pairing", () => {
  it("matches the strongest against the weakest", () => {
    const outcome = pairRound(request(ids(8), { config: pairing({ strategy: "seeded" }) }));
    expect(outcome.groups).toEqual([
      ["p1", "p8"],
      ["p2", "p7"],
      ["p3", "p6"],
      ["p4", "p5"],
    ]);
  });
});

describe("closest-record pairing", () => {
  const config = pairing({ strategy: "closest_record" });

  it("pairs inside score groups", () => {
    const points = new Map([
      ["p1", 2],
      ["p2", 2],
      ["p3", 1],
      ["p4", 1],
      ["p5", 0],
      ["p6", 0],
    ]);
    const outcome = pairRound(request(ids(6), { config, points }));

    for (const [a, b] of outcome.groups) {
      expect(points.get(a as string)).toBe(points.get(b as string));
    }
  });

  it("crosses score groups rather than leaving anyone unpaired", () => {
    // Three entrants on 2 points and one on 0: somebody must play down.
    const points = new Map([
      ["p1", 2],
      ["p2", 2],
      ["p3", 2],
      ["p4", 0],
    ]);
    const outcome = pairRound(request(ids(4), { config, points }));
    expect(outcome.groups).toHaveLength(2);
    expect(outcome.groups.flat().sort()).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("avoids a rematch even at the cost of pairing across groups", () => {
    const points = new Map([
      ["p1", 1],
      ["p2", 1],
      ["p3", 0],
      ["p4", 0],
    ]);
    const history = buildHistory([played("m1", "p1", "p2", 13, 5)]);
    const outcome = pairRound(request(ids(4), { config, points, history }));

    const met = outcome.groups.map(([a, b]) => pairKey(a as string, b as string));
    expect(met).not.toContain(pairKey("p1", "p2"));
    expect(outcome.brokenConstraints.avoidRematch).toBeUndefined();
  });

  it("reports a rematch it could not avoid rather than failing", () => {
    // Two entrants who have already met, and nobody else to play.
    const history = buildHistory([played("m1", "p1", "p2", 13, 5)]);
    const outcome = pairRound(request(ids(2), { config, history }));

    expect(outcome.groups).toEqual([["p1", "p2"]]);
    expect(outcome.brokenConstraints.avoidRematch).toBe(1);
  });
});

describe("rating-based pairing", () => {
  const ratings = new Map([
    ["p1", 1600],
    ["p2", 1580],
    ["p3", 1200],
    ["p4", 1190],
  ]);

  it("pairs the nearest ratings", () => {
    const outcome = pairRound(
      request(ids(4), { config: pairing({ strategy: "closest_rating" }), ratings }),
    );
    const pairs = outcome.groups.map((g) => g.slice().sort().join("+")).sort();
    expect(pairs).toEqual(["p1+p2", "p3+p4"]);
  });

  it("pairs the widest gaps when told to spread ratings", () => {
    const outcome = pairRound(
      request(ids(4), { config: pairing({ strategy: "rating_spread" }), ratings }),
    );
    const pairs = outcome.groups.map((g) => g.slice().sort().join("+")).sort();
    // The mirror image: strong against weak, so ratings converge faster.
    expect(pairs).toEqual(["p1+p4", "p2+p3"]);
  });
});

describe("constraints", () => {
  it("keeps entrants from the same club apart", () => {
    const meta = new Map([
      ["p1", { club: "north" }],
      ["p2", { club: "north" }],
      ["p3", { club: "south" }],
      ["p4", { club: "south" }],
    ]);
    const outcome = pairRound(
      request(ids(4), {
        config: pairing({
          strategy: "closest_rating",
          constraints: { avoidSameMeta: { enabled: true, field: "club" } },
        }),
        meta,
      }),
    );

    for (const [a, b] of outcome.groups) {
      expect(meta.get(a as string)?.club).not.toBe(meta.get(b as string)?.club);
    }
  });
});

describe("byes", () => {
  it("stands one entrant down when the field is odd", () => {
    const outcome = pairRound(request(ids(5)));
    expect(outcome.byes).toHaveLength(1);
    expect(outcome.groups).toHaveLength(2);
  });

  it("does not stand the same entrant down twice", () => {
    const history = emptyHistory();
    history.byes.set("p5", 1);
    const outcome = pairRound(request(ids(5), { history }));
    expect(outcome.byes).not.toContain("p5");
  });

  it("stands down the lowest ranked by default", () => {
    const points = new Map([
      ["p1", 3],
      ["p2", 2],
      ["p3", 1],
    ]);
    const outcome = pairRound(
      request(ids(3), { config: pairing({ strategy: "closest_record" }), points }),
    );
    expect(outcome.byes).toEqual(["p3"]);
  });

  it("stands down the leader when configured that way", () => {
    const points = new Map([
      ["p1", 3],
      ["p2", 2],
      ["p3", 1],
    ]);
    const outcome = pairRound(
      request(ids(3), {
        config: pairing({ strategy: "closest_record", byePolicy: "highest_ranked" }),
        points,
      }),
    );
    expect(outcome.byes).toEqual(["p1"]);
  });
});

describe("free-for-all rounds", () => {
  it("groups entrants into fixtures of the configured size", () => {
    const outcome = pairRound(request(ids(12), { sidesPerMatch: 4 }));
    expect(outcome.groups).toHaveLength(3);
    expect(outcome.groups.every((g) => g.length === 4)).toBe(true);
    expect(outcome.byes).toHaveLength(0);
  });

  it("stands down whoever does not fit a full fixture", () => {
    const outcome = pairRound(request(ids(10), { sidesPerMatch: 4 }));
    expect(outcome.groups).toHaveLength(2);
    expect(outcome.byes).toHaveLength(2);
  });
});

describe("invariants that must hold for any field", () => {
  const strategies = ["random", "closest_record", "closest_rating", "rating_spread"] as const;

  it("pairs every entrant exactly once per round", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 24 }),
        fc.constantFrom(...strategies),
        fc.integer({ min: 1, max: 10_000 }),
        (count, strategy, seed) => {
          const field = ids(count);
          const points = new Map(field.map((id, i) => [id, i % 4]));
          const ratings = new Map(field.map((id, i) => [id, 1000 + i * 37]));

          const outcome = pairRound(
            request(field, {
              config: pairing({ strategy }),
              points,
              ratings,
              rng: createRng(seed),
            }),
          );

          const appearances = [...outcome.groups.flat(), ...outcome.byes];
          expect(appearances).toHaveLength(count);
          expect(new Set(appearances).size).toBe(count);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never pairs an entrant with itself", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 20 }), fc.constantFrom(...strategies), (count, strategy) => {
        const outcome = pairRound(
          request(ids(count), { config: pairing({ strategy }), rng: createRng(count) }),
        );
        for (const group of outcome.groups) {
          expect(new Set(group).size).toBe(group.length);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("stands down at most one entrant in a two-sided round", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 30 }), (count) => {
        const outcome = pairRound(request(ids(count)));
        expect(outcome.byes.length).toBe(count % 2);
      }),
      { numRuns: 60 },
    );
  });

  it("produces the same round from the same inputs on every device", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 16 }),
        fc.constantFrom(...strategies),
        fc.integer({ min: 1, max: 1000 }),
        (count, strategy, seed) => {
          const build = () =>
            pairRound(
              request(ids(count), { config: pairing({ strategy }), rng: createRng(seed) }),
            );
          expect(build()).toEqual(build());
        },
      ),
      { numRuns: 100 },
    );
  });

  it("always stands down someone who has sat out least", () => {
    // Bye balance must beat the ordering policy, or the same person is benched
    // repeatedly while somebody else plays every round.
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 3, maxLength: 15 }).filter(
          (counts) => counts.length % 2 === 1,
        ),
        fc.constantFrom("lowest_ranked" as const, "highest_ranked" as const, "random" as const),
        (byeCounts, byePolicy) => {
          const field = ids(byeCounts.length);
          const history = emptyHistory();
          field.forEach((id, i) => history.byes.set(id, byeCounts[i] as number));

          const outcome = pairRound(
            request(field, { config: pairing({ byePolicy }), history }),
          );

          const benched = outcome.byes[0] as string;
          const fewest = Math.min(...byeCounts);
          expect(history.byes.get(benched)).toBe(fewest);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("finds a rematch-free round whenever one exists", () => {
    // A full round robin already played, minus the final round: the pairing for
    // that last round is forced, and the solver must find it.
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 6 }), (half) => {
        const count = half * 2;
        const field = ids(count);
        const rounds = bergerRounds(field);
        const lastRound = rounds[rounds.length - 1];
        if (!lastRound) return;

        const alreadyPlayed = rounds
          .slice(0, -1)
          .flatMap((round, r) =>
            round.map(([a, b], i) => played(`r${r}m${i}`, a, b, 1, 0)),
          );

        const outcome = pairRound(
          request(field, {
            config: pairing({ strategy: "closest_rating" }),
            history: buildHistory(alreadyPlayed),
          }),
        );

        expect(outcome.brokenConstraints.avoidRematch).toBeUndefined();
        const expected = new Set(lastRound.map(([a, b]) => pairKey(a, b)));
        const actual = new Set(outcome.groups.map(([a, b]) => pairKey(a as string, b as string)));
        expect(actual).toEqual(expected);
      }),
      { numRuns: 40 },
    );
  });
});
