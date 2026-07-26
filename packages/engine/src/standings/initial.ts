/**
 * Starting scores — the McMahon system.
 *
 * In a field spanning a huge range of strength, plain record pairing wastes
 * everybody's first three rounds: the strong beat the beginners, the beginners
 * lose to the strong, and nobody learns anything. This fixes it by starting
 * entrants on a score derived from their rating, so people meet their own level
 * from round one.
 *
 * The head start is *permanent* — it counts through to the final table. That is
 * the whole difference from accelerated pairings, where the boost exists only to
 * shape the draw and is taken away again afterwards.
 */

import type { StandingsConfig } from "../domain/config.js";
import type { EntrantId } from "../domain/entities.js";

/**
 * The score each entrant begins on.
 *
 * Returns an empty map when starting scores are off, so callers never have to
 * branch on whether the tournament uses them.
 */
export function startingScores(
  entrantIds: readonly EntrantId[],
  ratings: Map<EntrantId, number>,
  config: StandingsConfig,
): Map<EntrantId, number> {
  const scores = new Map<EntrantId, number>();
  const rule = config.initialScore;
  if (rule.source === "none" || entrantIds.length === 0) return scores;

  // The bar: everyone at or below it starts on zero, and bands are counted up
  // from there. Without a bar the whole field would shift by a constant, which
  // changes nothing about who plays whom.
  const rated = entrantIds
    .map((id) => ratings.get(id))
    .filter((r): r is number => r !== undefined);
  const floor = rule.floor ?? (rated.length > 0 ? Math.min(...rated) : 0);

  for (const id of entrantIds) {
    const rating = ratings.get(id);
    if (rating === undefined) continue;
    const bands = Math.floor(Math.max(0, rating - floor) / rule.bandSize);
    scores.set(id, Math.min(rule.maxBonus, bands));
  }

  return scores;
}

/**
 * Virtual points for accelerated pairings.
 *
 * For the first few rounds the stronger half of the field carries a bonus, so
 * the draw behaves as though they had already won. It shapes who plays whom and
 * nothing else: these points never reach the standings.
 */
export function accelerationBonus(
  entrantIds: readonly EntrantId[],
  points: Map<EntrantId, number>,
  ratings: Map<EntrantId, number>,
  options: { rounds: number; bonus: number },
  roundIndex: number,
): Map<EntrantId, number> {
  const adjusted = new Map(points);
  if (options.rounds <= 0 || roundIndex >= options.rounds) return adjusted;

  // Split on rating where there is one, and on the given order otherwise —
  // which, at round zero, is the seeding.
  const ordered = entrantIds
    .slice()
    .sort((a, b) => (ratings.get(b) ?? 0) - (ratings.get(a) ?? 0));
  const topHalf = new Set(ordered.slice(0, Math.floor(ordered.length / 2)));

  for (const id of entrantIds) {
    if (topHalf.has(id)) adjusted.set(id, (adjusted.get(id) ?? 0) + options.bonus);
  }

  return adjusted;
}
