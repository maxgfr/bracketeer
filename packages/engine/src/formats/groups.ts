/**
 * Group stages.
 *
 * A group stage is not a format of its own — it is N smaller tournaments run in
 * parallel, each playing whatever inner format was configured, with their
 * tables combined to decide who goes through.
 */

import type { EntrantId, Group } from "../domain/entities.js";
import { shuffle, type Rng } from "../util/rng.js";

export interface GroupAllocation {
  groupCount: number;
  groupSize: number | null;
  distribution: "snake" | "sequential" | "random";
  rng: Rng;
}

/** Group names run A, B, C… and wrap to AA, AB… past 26. */
export function groupName(index: number): string {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < 26) return letters[index] as string;
  const first = letters[Math.floor(index / 26) - 1] as string;
  const second = letters[index % 26] as string;
  return `${first}${second}`;
}

function resolveGroupCount(
  entrantCount: number,
  requested: number | null,
  size: number | null,
): number {
  if (requested && requested > 0) return Math.min(requested, Math.max(1, entrantCount));
  if (size && size > 0) return Math.max(1, Math.ceil(entrantCount / size));
  return Math.max(1, Math.min(4, entrantCount));
}

/**
 * Spread entrants across groups.
 *
 * "snake" alternates direction each pass — 1,2,3,4 then 4,3,2,1 — so the
 * strongest and weakest entrants are distributed evenly and no group ends up
 * carrying every top seed. That matters because the entrants arrive in seeded
 * order.
 */
export function allocateGroups(
  entrantIds: readonly EntrantId[],
  options: {
    groupCount: number | null;
    groupSize: number | null;
    distribution: "snake" | "sequential" | "random";
    rng: Rng;
  },
): Group[] {
  if (entrantIds.length === 0) return [];

  const count = resolveGroupCount(entrantIds.length, options.groupCount, options.groupSize);
  const buckets: EntrantId[][] = Array.from({ length: count }, () => []);

  const ordered =
    options.distribution === "random" ? shuffle(entrantIds, options.rng) : entrantIds.slice();

  if (options.distribution === "sequential") {
    const perGroup = Math.ceil(ordered.length / count);
    ordered.forEach((id, i) => {
      const bucket = buckets[Math.min(count - 1, Math.floor(i / perGroup))];
      bucket?.push(id);
    });
  } else {
    ordered.forEach((id, i) => {
      const pass = Math.floor(i / count);
      const withinPass = i % count;
      // Every other pass runs backwards, which is what makes it a snake.
      const index = pass % 2 === 0 ? withinPass : count - 1 - withinPass;
      buckets[index]?.push(id);
    });
  }

  return buckets.map((entrantIds, i) => ({
    id: `g${i + 1}`,
    name: `Group ${groupName(i)}`,
    entrantIds,
  }));
}

/**
 * Who advances from a group stage.
 *
 * `perGroup` takes a fixed number from each table. `bestOfRest` then tops up
 * from the best remaining entrants across all groups, compared by their
 * position within their own group first — the way an expanded World Cup picks
 * its best third-placed teams.
 */
export function selectQualifiers(
  groupRankings: readonly { groupId: string; ordered: readonly EntrantId[] }[],
  options: { perGroup: number | null; bestOfRest: number; total: number | null },
): EntrantId[] {
  const direct: EntrantId[] = [];
  const remainder: { entrantId: EntrantId; position: number }[] = [];

  const perGroup = options.perGroup ?? 0;

  for (const group of groupRankings) {
    group.ordered.forEach((entrantId, position) => {
      if (perGroup > 0 && position < perGroup) direct.push(entrantId);
      else remainder.push({ entrantId, position });
    });
  }

  const extras = remainder
    .slice()
    .sort((a, b) => a.position - b.position)
    .slice(0, Math.max(0, options.bestOfRest))
    .map((r) => r.entrantId);

  const all = [...direct, ...extras];
  return options.total && options.total > 0 ? all.slice(0, options.total) : all;
}
