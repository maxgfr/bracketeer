/**
 * Normalisation: the seam between "how this sport records a result" and
 * "who won".
 *
 * Every score kind collapses into one `NormalizedOutcome`. Downstream — points,
 * tiebreakers, ratings, bracket progression — reads only that, and therefore
 * never branches on the sport. Adding a new way of scoring means adding a case
 * here and nowhere else.
 */

import type { ScoreConfig } from "../domain/config.js";
import type { Match, MatchResult } from "../domain/entities.js";

export interface NormalizedOutcome {
  /**
   * Side indices grouped into tiers, best first. `[[1], [0, 2]]` means side 1
   * won and sides 0 and 2 tied for second.
   */
  places: number[][];
  /**
   * Magnitude scored by each side, used for point-difference tiebreakers.
   * null when the score kind carries no meaningful magnitude.
   */
  pointsFor: number[] | null;
  /** Underlying values before interpretation — raw points, total games, seconds. */
  rawFor: number[] | null;
  /** The single winning side, or null for a draw or a multi-way tie at the top. */
  winner: number | null;
  isDraw: boolean;
  overtime: boolean;
  forfeitBy: number[];
}

/** Rank side indices by a numeric key, best first, grouping equal keys into tiers. */
function tiersByValue(
  values: readonly (number | null)[],
  higherIsBetter: boolean,
  demoted: readonly number[],
): number[][] {
  const contenders: number[] = [];
  const trailing: number[] = [];

  values.forEach((value, index) => {
    if (demoted.includes(index) || value === null) trailing.push(index);
    else contenders.push(index);
  });

  const sorted = contenders.slice().sort((a, b) => {
    const va = values[a] as number;
    const vb = values[b] as number;
    return higherIsBetter ? vb - va : va - vb;
  });

  const tiers: number[][] = [];
  for (const index of sorted) {
    const last = tiers[tiers.length - 1];
    const prev = last?.[0];
    if (last && prev !== undefined && values[index] === values[prev]) last.push(index);
    else tiers.push([index]);
  }

  // Everyone who forfeited or did not finish shares last place.
  if (trailing.length > 0) tiers.push(trailing);
  return tiers;
}

function winnerOfTiers(tiers: readonly number[][]): { winner: number | null; isDraw: boolean } {
  const top = tiers[0];
  if (!top) return { winner: null, isDraw: false };
  if (top.length === 1) return { winner: top[0] as number, isDraw: false };
  return { winner: null, isDraw: true };
}

/** Total each side's score across all sets. */
function totalsAcrossSets(sets: readonly number[][], sideCount: number): number[] {
  const totals = new Array<number>(sideCount).fill(0);
  for (const set of sets) {
    for (let i = 0; i < sideCount; i += 1) totals[i] = (totals[i] as number) + (set[i] ?? 0);
  }
  return totals;
}

/** How many sets each side took. A set with no clear leader counts for nobody. */
function setsWon(sets: readonly number[][], sideCount: number): number[] {
  const won = new Array<number>(sideCount).fill(0);
  for (const set of sets) {
    let best = -Infinity;
    let bestIndex = -1;
    let tied = false;
    for (let i = 0; i < sideCount; i += 1) {
      const value = set[i] ?? 0;
      if (value > best) {
        best = value;
        bestIndex = i;
        tied = false;
      } else if (value === best) {
        tied = true;
      }
    }
    if (!tied && bestIndex >= 0) won[bestIndex] = (won[bestIndex] as number) + 1;
  }
  return won;
}

/** Points awarded for finishing in a given place, when the score kind is `placement`. */
function placementPoints(places: readonly number[][], table: readonly number[], sideCount: number): number[] {
  const points = new Array<number>(sideCount).fill(0);
  let position = 0;
  for (const tier of places) {
    // Tied competitors share the sum of the places they occupy, as in motorsport.
    const slice = table.length > 0
      ? tier.map((_, offset) => table[position + offset] ?? 0)
      : tier.map((_, offset) => Math.max(0, sideCount - (position + offset) - 1));
    const shared = slice.reduce((a, b) => a + b, 0) / tier.length;
    for (const index of tier) points[index] = shared;
    position += tier.length;
  }
  return points;
}

/**
 * Turn a reported result into a canonical outcome.
 *
 * Throws if the result's shape does not match the configured score kind — that
 * is a programming error, not user input, because the UI only ever offers the
 * configured shape.
 */
export function normalizeResult(
  result: MatchResult,
  config: ScoreConfig,
  sideCount: number,
): NormalizedOutcome {
  const forfeitBy = result.forfeitBy ?? [];
  const overtime = result.overtime ?? false;

  const finish = (
    places: number[][],
    pointsFor: number[] | null,
    rawFor: number[] | null,
  ): NormalizedOutcome => ({
    places,
    pointsFor,
    rawFor,
    ...winnerOfTiers(places),
    overtime,
    forfeitBy,
  });

  if (result.kind !== config.kind) {
    throw new Error(
      `Result is a "${result.kind}" result but this tournament scores by "${config.kind}"`,
    );
  }

  switch (result.kind) {
    case "points": {
      const scores = result.scores;
      const places = tiersByValue(scores, true, forfeitBy);
      return finish(places, scores.slice(), scores.slice());
    }

    case "sets": {
      const won = setsWon(result.sets, sideCount);
      const totals = totalsAcrossSets(result.sets, sideCount);
      const places = tiersByValue(won, true, forfeitBy);
      return finish(places, won, totals);
    }

    case "outcome": {
      if (result.winner === null) {
        const everyone = Array.from({ length: sideCount }, (_, i) => i);
        const contenders = everyone.filter((i) => !forfeitBy.includes(i));
        const places = forfeitBy.length > 0 ? [contenders, forfeitBy] : [everyone];
        return finish(places, null, null);
      }
      const others = Array.from({ length: sideCount }, (_, i) => i).filter(
        (i) => i !== result.winner,
      );
      return finish([[result.winner], others], null, null);
    }

    case "placement": {
      const table = config.kind === "placement" ? config.pointsByPlace : [];
      const places = result.places.map((tier) => tier.slice());
      return finish(places, placementPoints(places, table, sideCount), null);
    }

    case "time": {
      const lowerIsBetter = config.kind === "time" ? config.lowerIsBetter : true;
      const places = tiersByValue(result.times, !lowerIsBetter, forfeitBy);
      const raw = result.times.map((t) => t ?? 0);
      return finish(places, null, raw);
    }
  }
}

/**
 * The outcome of a match as it currently stands, or null if it has not been
 * decided. A bye is decided the moment it is created: the lone side advances.
 */
export function outcomeOfMatch(match: Match, config: ScoreConfig): NormalizedOutcome | null {
  if (match.status === "void") return null;

  if (match.status === "bye") {
    const present = match.sides
      .map((side, index) => ({ side, index }))
      .filter((s) => s.side.entrantId !== null)
      .map((s) => s.index);
    const absent = match.sides.map((_, i) => i).filter((i) => !present.includes(i));
    return {
      places: absent.length > 0 ? [present, absent] : [present],
      pointsFor: null,
      rawFor: null,
      winner: present.length === 1 ? (present[0] as number) : null,
      isDraw: false,
      overtime: false,
      forfeitBy: [],
    };
  }

  if (!match.result) return null;
  return normalizeResult(match.result, config, match.sides.length);
}

/** The entrant that won, or null if the match is undecided or drawn. */
export function winnerEntrantId(match: Match, config: ScoreConfig): string | null {
  const outcome = outcomeOfMatch(match, config);
  if (!outcome || outcome.winner === null) return null;
  return match.sides[outcome.winner]?.entrantId ?? null;
}

/**
 * The entrant that lost. Only meaningful for two-sided matches — an elimination
 * bracket cannot drop three people into the losers' side of one fixture.
 */
export function loserEntrantId(match: Match, config: ScoreConfig): string | null {
  if (match.sides.length !== 2) return null;
  const outcome = outcomeOfMatch(match, config);
  if (!outcome || outcome.winner === null) return null;
  return match.sides[outcome.winner === 0 ? 1 : 0]?.entrantId ?? null;
}
