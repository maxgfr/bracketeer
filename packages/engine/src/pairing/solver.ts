/**
 * Minimum-cost pairing.
 *
 * Two-sided rounds are a minimum-weight perfect matching. This solves it by
 * branch and bound, seeded with a greedy solution so there is always an answer
 * to return, and capped by a node budget so a large field degrades to
 * "very good" instead of hanging.
 *
 * The search always pairs the *first* unpaired entrant, choosing only its
 * partner. That is what keeps the tree at (n-1)!! rather than n!, and combined
 * with the bound it settles realistic Swiss fields exactly.
 */

import type { EntrantId } from "../domain/entities.js";

export interface Pairing {
  pairs: [EntrantId, EntrantId][];
  cost: number;
  /** True when the search proved this optimal rather than running out of budget. */
  optimal: boolean;
}

export type CostFn = (a: EntrantId, b: EntrantId) => number;

/** Repeatedly take the cheapest available pair. Fast, and never worse than nothing. */
function greedy(ids: readonly EntrantId[], cost: CostFn): Pairing {
  const remaining = ids.slice();
  const pairs: [EntrantId, EntrantId][] = [];
  let total = 0;

  while (remaining.length >= 2) {
    let bestI = 0;
    let bestJ = 1;
    let bestCost = Infinity;

    for (let i = 0; i < remaining.length; i += 1) {
      for (let j = i + 1; j < remaining.length; j += 1) {
        const c = cost(remaining[i] as EntrantId, remaining[j] as EntrantId);
        if (c < bestCost) {
          bestCost = c;
          bestI = i;
          bestJ = j;
        }
      }
    }

    pairs.push([remaining[bestI] as EntrantId, remaining[bestJ] as EntrantId]);
    total += bestCost;
    remaining.splice(bestJ, 1);
    remaining.splice(bestI, 1);
  }

  return { pairs, cost: total, optimal: false };
}

/**
 * Pair every entrant at minimum total cost.
 *
 * `ids` must have even length — callers assign byes first. Order matters only
 * for tie-breaking, and callers pass a deterministic order, so the result is
 * identical on every device.
 */
export function solvePairing(
  ids: readonly EntrantId[],
  cost: CostFn,
  budget: number,
): Pairing {
  if (ids.length === 0) return { pairs: [], cost: 0, optimal: true };
  if (ids.length === 2) {
    const [a, b] = ids as [EntrantId, EntrantId];
    return { pairs: [[a, b]], cost: cost(a, b), optimal: true };
  }

  // Cache costs: the search revisits the same pairs constantly.
  const n = ids.length;
  const costs = new Float64Array(n * n);
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const c = cost(ids[i] as EntrantId, ids[j] as EntrantId);
      costs[i * n + j] = c;
      costs[j * n + i] = c;
    }
  }

  // The cheapest partner for each entrant, halved and summed, lower-bounds the
  // cost of any completion — every remaining entrant must pay at least that.
  const cheapest = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    let min = Infinity;
    for (let j = 0; j < n; j += 1) {
      if (i !== j) min = Math.min(min, costs[i * n + j] as number);
    }
    cheapest[i] = min;
  }

  const initial = greedy(ids, cost);
  let bestPairs: [EntrantId, EntrantId][] = initial.pairs;
  let bestCost = initial.cost;

  const used = new Uint8Array(n);
  const chosen: [number, number][] = [];
  let nodes = 0;
  let exhausted = false;

  const lowerBound = (): number => {
    let bound = 0;
    for (let i = 0; i < n; i += 1) if (!used[i]) bound += cheapest[i] as number;
    return bound / 2;
  };

  const search = (paired: number, costSoFar: number): void => {
    if (exhausted) return;
    if (paired === n) {
      if (costSoFar < bestCost) {
        bestCost = costSoFar;
        bestPairs = chosen.map(([i, j]) => [ids[i] as EntrantId, ids[j] as EntrantId]);
      }
      return;
    }

    nodes += 1;
    if (nodes > budget) {
      exhausted = true;
      return;
    }

    if (costSoFar + lowerBound() >= bestCost) return;

    let first = -1;
    for (let i = 0; i < n; i += 1) {
      if (!used[i]) {
        first = i;
        break;
      }
    }
    if (first < 0) return;

    // Try the cheapest partners first, so the bound tightens early.
    const candidates: number[] = [];
    for (let j = first + 1; j < n; j += 1) if (!used[j]) candidates.push(j);
    candidates.sort((a, b) => (costs[first * n + a] as number) - (costs[first * n + b] as number));

    used[first] = 1;
    for (const j of candidates) {
      if (exhausted) break;
      used[j] = 1;
      chosen.push([first, j]);
      search(paired + 2, costSoFar + (costs[first * n + j] as number));
      chosen.pop();
      used[j] = 0;
    }
    used[first] = 0;
  };

  search(0, 0);

  return { pairs: bestPairs, cost: bestCost, optimal: !exhausted };
}

/**
 * Partition entrants into groups of `size` for free-for-all fixtures.
 *
 * Grouping is not a matching problem, and an exact solution is not worth the
 * complexity, so this takes entrants in the order the strategy sorted them and
 * chunks them — which is exactly what "group the closest together" means once
 * the list is already sorted by the relevant axis.
 */
export function chunkIntoGroups(ids: readonly EntrantId[], size: number): EntrantId[][] {
  const groups: EntrantId[][] = [];
  for (let i = 0; i + size <= ids.length; i += size) {
    groups.push(ids.slice(i, i + size));
  }
  return groups;
}
