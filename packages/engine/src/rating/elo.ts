/**
 * Elo.
 *
 * The classic: you gain what your opponent loses, scaled by how surprising the
 * result was. Simple enough that competitors can check it themselves, which is
 * most of why it has outlived its successors.
 */

import type { RatingConfig } from "../domain/config.js";

export interface EloPlayer {
  rating: number;
  matchesPlayed: number;
}

/** Probability that a beats b. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/**
 * How much a result is allowed to move a rating.
 *
 * Larger while an entrant is still establishing a rating, so a newcomer's true
 * level is found quickly instead of over a season.
 */
export function kFactor(config: RatingConfig, matchesPlayed: number): number {
  return matchesPlayed < config.elo.provisionalMatches ? config.elo.provisionalK : config.elo.k;
}

/**
 * Scale the update by how convincing the win was.
 *
 * Normalised so a one-point win is worth exactly the configured K and wider
 * margins grow logarithmically. Capped, because a thrashing says less about
 * relative strength than the first point of margin does.
 */
export function marginMultiplier(margin: number): number {
  const size = Math.abs(margin);
  if (size <= 1) return 1;
  return Math.min(3, Math.log(1 + size) / Math.log(2));
}

function clamp(rating: number, config: RatingConfig): number {
  const floored = config.elo.floor !== null ? Math.max(config.elo.floor, rating) : rating;
  return config.elo.ceiling !== null ? Math.min(config.elo.ceiling, floored) : floored;
}

/**
 * One head-to-head update.
 *
 * `score` is 1 for a win, 0.5 for a draw, 0 for a loss. `weight` scales the
 * change, which is how a free-for-all splits one result across the several
 * pairwise comparisons it implies.
 */
export function eloUpdate(
  player: EloPlayer,
  opponent: EloPlayer,
  score: number,
  config: RatingConfig,
  options: { margin?: number; weight?: number } = {},
): number {
  const expected = expectedScore(player.rating, opponent.rating);
  const k = kFactor(config, player.matchesPlayed);
  const multiplier =
    config.elo.marginOfVictory && options.margin !== undefined
      ? marginMultiplier(options.margin)
      : 1;

  const delta = k * multiplier * (options.weight ?? 1) * (score - expected);
  return clamp(player.rating + delta, config);
}
