/**
 * Bracket seeding.
 *
 * The classic fold: the strongest entrant meets the weakest, and seeds are
 * arranged so the top two can only meet in the final, the top four only in the
 * semi-finals, and so on.
 */

import type { EntrantId } from "../domain/entities.js";
import { shuffle, type Rng } from "../util/rng.js";

/**
 * Seed numbers in bracket-slot order for a draw of `size` (a power of two).
 *
 * Built by repeatedly doubling: every seed `s` in a bracket of n becomes the
 * pair `s` and `2n + 1 - s`. For eight that yields 1-8, 4-5, 2-7, 3-6.
 */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next: number[] = [];
    const total = order.length * 2;
    for (const seed of order) {
      next.push(seed, total + 1 - seed);
    }
    order = next;
  }
  return order;
}

/** The smallest power of two that fits the field. */
export function bracketSize(count: number): number {
  let size = 1;
  while (size < count) size *= 2;
  return Math.max(size, 1);
}

/**
 * Lay entrants into bracket slots, padding with byes.
 *
 * A slot holding null is an empty seat: whoever faces it walks over. Because
 * seeds are laid out by the fold above, those byes land on the strongest
 * entrants, which is the conventional reward for seeding well.
 */
export type SeedingMethod = "standard" | "ordered" | "random" | "manual" | "by_rating";

export function seedIntoBracket(
  entrantIds: readonly EntrantId[],
  /**
   * `by_rating` behaves exactly like `standard`; the difference is upstream,
   * where the caller orders the field by rating instead of by entered seed.
   */
  method: SeedingMethod,
  rng: Rng,
  manualSlots: readonly EntrantId[] = [],
): (EntrantId | null)[] {
  const size = bracketSize(entrantIds.length);

  if (method === "manual" && manualSlots.length > 0) {
    return Array.from({ length: size }, (_, i) => manualSlots[i] ?? null);
  }

  const ordered =
    method === "random" ? shuffle(entrantIds, rng) : entrantIds.slice();

  if (method === "ordered") {
    return Array.from({ length: size }, (_, i) => ordered[i] ?? null);
  }

  // "standard" and "random" both use the fold; they differ only in what order
  // the entrants were in before being folded.
  const order = seedOrder(size);
  return order.map((seed) => ordered[seed - 1] ?? null);
}
