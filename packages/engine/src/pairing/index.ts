/**
 * Pairing: deciding who plays whom.
 *
 * The strategy chooses what a good round looks like; the constraint layer says
 * what to avoid; the solver reconciles the two. Strategies that decide
 * structurally (`seeded`, `berger`) bypass the solver, because their answer is
 * determined by the format rather than by preference.
 */

import type { PairingConfig, PairingStrategy } from "../domain/config.js";
import type { EntrantId } from "../domain/entities.js";
import { shuffle, type Rng } from "../util/rng.js";
import { buildScoreGroups, pairCost, type CostContext, type SeparationContext } from "./cost.js";
import { byesReceived, type PairingHistory } from "./history.js";
import { chunkIntoGroups, solvePairing } from "./solver.js";

export * from "./berger.js";
export * from "./cost.js";
export * from "./history.js";
export * from "./seeding.js";
export * from "./solver.js";

export interface PairingRequest {
  /** Entrants available this round, in a deterministic order. */
  entrantIds: readonly EntrantId[];
  sidesPerMatch: number;
  config: PairingConfig;
  history: PairingHistory;
  /** Competition points so far, for `closest_record`. */
  points: Map<EntrantId, number>;
  ratings: Map<EntrantId, number>;
  meta: Map<EntrantId, Record<string, string>>;
  rng: Rng;
}

export interface PairingOutcome {
  /** One entry per fixture; each holds that fixture's sides in order. */
  groups: EntrantId[][];
  /** Entrants with no fixture this round. */
  byes: EntrantId[];
  /** Constraints the solver had to break, with how many times. */
  brokenConstraints: Record<string, number>;
  /** False when the search hit its budget and returned its best effort. */
  optimal: boolean;
}

/** Sort entrants along the axis the strategy cares about, best first. */
function orderForStrategy(request: PairingRequest, strategy: PairingStrategy): EntrantId[] {
  const ids = request.entrantIds.slice();

  switch (strategy) {
    case "random":
      return shuffle(ids, request.rng);
    case "closest_rating":
    case "rating_spread":
      return ids.sort((a, b) => (request.ratings.get(b) ?? 0) - (request.ratings.get(a) ?? 0));
    case "closest_record":
      return ids.sort((a, b) => {
        const diff = (request.points.get(b) ?? 0) - (request.points.get(a) ?? 0);
        // Inside a score group, order by rating so pairings stay stable and the
        // strongest of the group meets the strongest available opponent.
        return diff !== 0 ? diff : (request.ratings.get(b) ?? 0) - (request.ratings.get(a) ?? 0);
      });
    case "seeded":
    case "berger":
      return ids;
  }
}

/**
 * Choose who sits out, when the field does not divide evenly.
 *
 * `balanceByes` makes previous byes dominate the choice, so the same person is
 * not stood down twice while somebody else has played every round.
 */
function assignByes(
  ordered: readonly EntrantId[],
  count: number,
  config: PairingConfig,
  history: PairingHistory,
  rng: Rng,
): { byes: EntrantId[]; playing: EntrantId[] } {
  if (count <= 0) return { byes: [], playing: ordered.slice() };

  // Start from the order the policy prefers: whoever it would stand down first.
  // `ordered` is strongest first, so "lowest ranked" reads it backwards.
  const preferred =
    config.byePolicy === "random"
      ? shuffle(ordered, rng)
      : config.byePolicy === "highest_ranked"
        ? ordered.slice()
        : ordered.slice().reverse();

  // Then let bye balance override it. Sorting is stable, so entrants who have
  // sat out equally often keep the policy's order — but nobody sits out twice
  // while somebody else has played every round.
  const pool = config.constraints.balanceByes.enabled
    ? preferred
        .slice()
        .sort((a, b) => byesReceived(history, a) - byesReceived(history, b))
    : preferred;

  const byes = pool.slice(0, count);
  const byeSet = new Set(byes);
  return { byes, playing: ordered.filter((id) => !byeSet.has(id)) };
}

/**
 * Pair one round.
 *
 * Deterministic: the same request produces the same round on every device,
 * which is what lets peers replay a shared log without diverging.
 */
export function pairRound(request: PairingRequest): PairingOutcome {
  const strategy = request.config.strategy;
  const ordered = orderForStrategy(request, strategy);
  const sides = Math.max(2, request.sidesPerMatch);

  const leftOver = ordered.length % sides;
  const { byes, playing } = assignByes(
    ordered,
    leftOver,
    request.config,
    request.history,
    request.rng,
  );

  const brokenConstraints: Record<string, number> = {};

  if (playing.length === 0) {
    return { groups: [], byes, brokenConstraints, optimal: true };
  }

  // Free-for-all fixtures are a partition, not a matching: the list is already
  // sorted along the strategy's axis, so chunking it is what "group the closest
  // together" means.
  if (sides > 2) {
    return { groups: chunkIntoGroups(playing, sides), byes, brokenConstraints, optimal: true };
  }

  if (strategy === "seeded") {
    // Strongest meets weakest, second meets second-weakest, and so on.
    const groups: EntrantId[][] = [];
    for (let i = 0; i < playing.length / 2; i += 1) {
      groups.push([playing[i] as EntrantId, playing[playing.length - 1 - i] as EntrantId]);
    }
    return { groups, byes, brokenConstraints, optimal: true };
  }

  const separation: SeparationContext = {
    scoreGroup: buildScoreGroups(playing, request.points),
    ratings: request.ratings,
    ratingRange: ratingRange(playing, request.ratings),
  };

  const context: CostContext = {
    config: request.config,
    history: request.history,
    separation,
    meta: request.meta,
  };

  const solution = solvePairing(
    playing,
    (a, b) => pairCost(a, b, strategy, context).cost,
    request.config.constraints.searchBudget,
  );

  for (const [a, b] of solution.pairs) {
    for (const name of pairCost(a, b, strategy, context).broken) {
      brokenConstraints[name] = (brokenConstraints[name] ?? 0) + 1;
    }
  }

  return {
    groups: solution.pairs.map(([a, b]) => [a, b]),
    byes,
    brokenConstraints,
    optimal: solution.optimal,
  };
}

function ratingRange(ids: readonly EntrantId[], ratings: Map<EntrantId, number>): number {
  let min = Infinity;
  let max = -Infinity;
  for (const id of ids) {
    const rating = ratings.get(id);
    if (rating === undefined) continue;
    min = Math.min(min, rating);
    max = Math.max(max, rating);
  }
  return Number.isFinite(min) && Number.isFinite(max) ? max - min : 0;
}
