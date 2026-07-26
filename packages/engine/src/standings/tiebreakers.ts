/**
 * Tiebreakers.
 *
 * These are applied as an ordered pipeline that repeatedly splits groups of tied
 * entrants, rather than as a single comparator. That structure is necessary
 * because head-to-head is not a property of an entrant — it only means anything
 * relative to the specific set of people still tied with them.
 *
 * Several of these exist to answer one question: was your record earned against
 * a hard draw or an easy one? Buchholz and Sonneborn-Berger are how a competitor
 * who lost narrowly to the three strongest opponents finishes above one who beat
 * the bottom of the field.
 */

import type { Tiebreaker, TiebreakerKey } from "../domain/config.js";
import type { EntrantId } from "../domain/entities.js";
import { seedFromString } from "../util/rng.js";
import type { EntrantRecord } from "./records.js";

export interface TiebreakContext {
  records: Map<EntrantId, EntrantRecord>;
  /** Current rating per entrant, when a rating system is enabled. */
  ratings: Map<EntrantId, number>;
  /** Tournament seed, so drawn lots are identical on every device. */
  seed: number;
}

/**
 * The strength of an opponent, for Buchholz-style measures.
 *
 * A bye has no real opponent. Counting it as zero would punish whoever happened
 * to draw the odd number, so it counts as a virtual opponent of the entrant's
 * own strength — the same convention chess uses, and the one that keeps a hard
 * draw from being penalised twice.
 */
function opponentStrength(
  record: EntrantRecord,
  context: TiebreakContext,
): { values: number[]; own: number } {
  const own = record.competitionPoints;
  const values: number[] = [];
  for (const appearance of record.appearances) {
    if (appearance.kind === "bye" || appearance.opponentIds.length === 0) {
      values.push(own);
      continue;
    }
    for (const opponentId of appearance.opponentIds) {
      values.push(context.records.get(opponentId)?.competitionPoints ?? 0);
    }
  }
  return { values, own };
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/**
 * A scalar for a single entrant. Returns null for head-to-head, which cannot be
 * expressed as one and is handled separately.
 */
function metric(key: TiebreakerKey, id: EntrantId, context: TiebreakContext): number {
  const record = context.records.get(id);
  if (!record) return 0;

  switch (key) {
    case "points":
      return record.competitionPoints;
    case "wins":
      return record.wins;
    case "buchholz":
      return sum(opponentStrength(record, context).values);
    case "median_buchholz": {
      const values = opponentStrength(record, context).values.slice().sort((a, b) => a - b);
      // Drop the strongest and the weakest opponent, which limits how much one
      // freak pairing distorts the measure.
      return values.length <= 2 ? sum(values) : sum(values.slice(1, -1));
    }
    case "sonneborn_berger": {
      let total = 0;
      for (const appearance of record.appearances) {
        if (appearance.kind === "bye" || appearance.opponentIds.length === 0) {
          total += record.competitionPoints;
          continue;
        }
        const strength = sum(
          appearance.opponentIds.map((o) => context.records.get(o)?.competitionPoints ?? 0),
        );
        if (appearance.kind === "win") total += strength;
        else if (appearance.kind === "draw") total += strength / 2;
      }
      return total;
    }
    case "point_diff":
      return record.pointsFor - record.pointsAgainst;
    case "points_for":
      return record.pointsFor;
    case "points_against":
      return record.pointsAgainst;
    case "opponent_avg_rating": {
      const ratings: number[] = [];
      for (const appearance of record.appearances) {
        for (const opponentId of appearance.opponentIds) {
          const rating = context.ratings.get(opponentId);
          if (rating !== undefined) ratings.push(rating);
        }
      }
      return ratings.length === 0 ? 0 : sum(ratings) / ratings.length;
    }
    case "rating":
      return context.ratings.get(id) ?? 0;
    case "matches_played":
      return record.played;
    case "drawn_lot":
      // Deterministic from the tournament seed: every device draws the same lot,
      // and the same tournament always draws the same one.
      return seedFromString(`${context.seed}:${id}`) / 0xffffffff;
    case "head_to_head":
      return 0;
  }
}

/**
 * Competition points earned in matches played only among the tied entrants.
 * Meaningless outside a specific tied group, which is why it is computed here
 * rather than as a plain metric.
 */
function headToHeadPoints(id: EntrantId, group: readonly EntrantId[], context: TiebreakContext): number {
  const record = context.records.get(id);
  if (!record) return 0;
  const tied = new Set(group);

  let total = 0;
  for (const appearance of record.appearances) {
    if (appearance.opponentIds.length === 0) continue;
    // Only count a fixture if every other participant is also still tied.
    if (!appearance.opponentIds.every((o) => tied.has(o))) continue;
    total += appearance.competitionPoints;
  }
  return total;
}

function valuesFor(
  tiebreaker: Tiebreaker,
  group: readonly EntrantId[],
  context: TiebreakContext,
): Map<EntrantId, number> {
  const values = new Map<EntrantId, number>();
  for (const id of group) {
    values.set(
      id,
      tiebreaker.key === "head_to_head"
        ? headToHeadPoints(id, group, context)
        : metric(tiebreaker.key, id, context),
    );
  }
  return values;
}

/**
 * Split a tied group by one tiebreaker, best first. A group that the tiebreaker
 * cannot separate comes back unchanged, and the next tiebreaker tries.
 */
function splitGroup(
  group: readonly EntrantId[],
  tiebreaker: Tiebreaker,
  context: TiebreakContext,
): EntrantId[][] {
  if (group.length <= 1) return [group.slice()];

  const values = valuesFor(tiebreaker, group, context);
  const sorted = group.slice().sort((a, b) => {
    const va = values.get(a) ?? 0;
    const vb = values.get(b) ?? 0;
    return tiebreaker.direction === "desc" ? vb - va : va - vb;
  });

  const out: EntrantId[][] = [];
  for (const id of sorted) {
    const last = out[out.length - 1];
    const head = last?.[0];
    if (last && head !== undefined && values.get(head) === values.get(id)) last.push(id);
    else out.push([id]);
  }
  return out;
}

/**
 * Order entrants by applying tiebreakers in sequence.
 *
 * Returns tiers: entrants the configured tiebreakers could not separate come
 * back sharing a place, rather than being silently ordered by something
 * arbitrary. Adding `drawn_lot` last guarantees a total order.
 */
export function rankEntrants(
  entrantIds: readonly EntrantId[],
  tiebreakers: readonly Tiebreaker[],
  context: TiebreakContext,
): EntrantId[][] {
  let tiers: EntrantId[][] = [entrantIds.slice()];

  for (const tiebreaker of tiebreakers) {
    if (tiers.every((tier) => tier.length === 1)) break;
    tiers = tiers.flatMap((tier) => splitGroup(tier, tiebreaker, context));
  }

  return tiers;
}

/** Every tiebreaker's value for one entrant, for display in a standings table. */
export function metricsFor(
  id: EntrantId,
  tiebreakers: readonly Tiebreaker[],
  group: readonly EntrantId[],
  context: TiebreakContext,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tiebreaker of tiebreakers) {
    out[tiebreaker.key] =
      tiebreaker.key === "head_to_head"
        ? headToHeadPoints(id, group, context)
        : metric(tiebreaker.key, id, context);
  }
  return out;
}
