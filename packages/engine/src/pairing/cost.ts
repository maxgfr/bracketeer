/**
 * The cost of putting two entrants in the same fixture.
 *
 * Constraints are weighted costs, not hard rules. A hard rule can make a round
 * impossible to pair at all — in the last round of a Swiss event, "never repeat
 * a fixture" and "pair everyone" frequently cannot both hold. Weighted costs
 * degrade instead: the solver finds the least-bad round and reports exactly
 * which constraints it had to break, which is information the organiser can act
 * on rather than an error message.
 *
 * Separation costs are expressed in *normalised* units — score-group distance
 * and fraction of the rating range — rather than raw points. A weight therefore
 * means the same thing whether the sport scores 3-1-0 or 1-0.5-0, and whether
 * ratings run 0-3000 or 0-50.
 */

import type { PairingConfig, PairingStrategy } from "../domain/config.js";
import type { EntrantId } from "../domain/entities.js";
import { timesMet, type PairingHistory } from "./history.js";

/** How far apart two entrants are, on the axis the strategy cares about. */
export interface SeparationContext {
  /** Index of each entrant's score group, best group first. */
  scoreGroup: Map<EntrantId, number>;
  ratings: Map<EntrantId, number>;
  /** Highest rating minus lowest, used to normalise rating distances. */
  ratingRange: number;
}

export interface CostContext {
  config: PairingConfig;
  history: PairingHistory;
  separation: SeparationContext;
  meta: Map<EntrantId, Record<string, string>>;
}

/** Scale that puts normalised separation on the same footing as constraint weights. */
const SEPARATION_SCALE = 100;

/**
 * How much this strategy dislikes pairing these two, before constraints.
 * Always non-negative, and zero for the pairing the strategy most wants.
 */
export function separationCost(
  a: EntrantId,
  b: EntrantId,
  strategy: PairingStrategy,
  context: SeparationContext,
): number {
  switch (strategy) {
    case "closest_record": {
      const ga = context.scoreGroup.get(a) ?? 0;
      const gb = context.scoreGroup.get(b) ?? 0;
      return Math.abs(ga - gb) * SEPARATION_SCALE;
    }
    case "closest_rating": {
      if (context.ratingRange <= 0) return 0;
      const ra = context.ratings.get(a) ?? 0;
      const rb = context.ratings.get(b) ?? 0;
      return (Math.abs(ra - rb) / context.ratingRange) * SEPARATION_SCALE;
    }
    case "rating_spread": {
      if (context.ratingRange <= 0) return 0;
      const ra = context.ratings.get(a) ?? 0;
      const rb = context.ratings.get(b) ?? 0;
      // The mirror image of closest_rating: a wide gap is what we want, so a
      // narrow one is what costs.
      return (1 - Math.abs(ra - rb) / context.ratingRange) * SEPARATION_SCALE;
    }
    case "random":
    case "seeded":
    case "berger":
      // These decide who meets whom structurally rather than by preference.
      return 0;
  }
}

/** Which constraints a candidate pairing would break, and what that costs. */
export function pairCost(
  a: EntrantId,
  b: EntrantId,
  strategy: PairingStrategy,
  context: CostContext,
): { cost: number; broken: string[] } {
  const { constraints } = context.config;
  const broken: string[] = [];
  let cost = separationCost(a, b, strategy, context.separation);

  if (constraints.avoidRematch.enabled) {
    const met = timesMet(context.history, a, b);
    if (met > 0) {
      cost += constraints.avoidRematch.weight * met;
      broken.push("avoidRematch");
    }
  }

  if (constraints.avoidSameMeta.enabled) {
    const field = constraints.avoidSameMeta.field;
    const va = context.meta.get(a)?.[field];
    const vb = context.meta.get(b)?.[field];
    if (va !== undefined && va !== "" && va === vb) {
      cost += constraints.avoidSameMeta.weight;
      broken.push("avoidSameMeta");
    }
  }

  if (constraints.balanceHomeAway.enabled) {
    const ba = context.history.homeBalance.get(a) ?? 0;
    const bb = context.history.homeBalance.get(b) ?? 0;
    // Two entrants both overdue the same side of the fixture is awkward: one of
    // them will have to take a third home game in a row.
    if (Math.sign(ba) === Math.sign(bb) && ba !== 0) {
      cost += constraints.balanceHomeAway.weight * Math.min(Math.abs(ba), Math.abs(bb));
      broken.push("balanceHomeAway");
    }
  }

  return { cost, broken };
}

/**
 * Group entrants into score groups, best first, for `closest_record`.
 *
 * Working in group indices rather than raw points is what makes the Swiss idea
 * portable: "one group apart" means the same thing in every sport.
 */
export function buildScoreGroups(
  entrantIds: readonly EntrantId[],
  points: Map<EntrantId, number>,
): Map<EntrantId, number> {
  const distinct = [...new Set(entrantIds.map((id) => points.get(id) ?? 0))].sort(
    (a, b) => b - a,
  );
  const indexOf = new Map(distinct.map((value, index) => [value, index]));

  const groups = new Map<EntrantId, number>();
  for (const id of entrantIds) groups.set(id, indexOf.get(points.get(id) ?? 0) ?? 0);
  return groups;
}
