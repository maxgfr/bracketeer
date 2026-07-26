/**
 * Records: what each entrant has actually done.
 *
 * Everything here is derived from normalised outcomes, so a record is built the
 * same way whether the sport counts points, sets, finishing positions or
 * seconds. Tiebreakers then read records and never touch raw results.
 */

import type { PointsSystem, ScoreConfig, StandingsConfig } from "../domain/config.js";
import type { EntrantId, Match } from "../domain/entities.js";
import { outcomeOfMatch, type NormalizedOutcome } from "../scoring/normalize.js";

export type ResultKind = "win" | "draw" | "loss" | "bye";

export interface MatchAppearance {
  matchId: string;
  /** Everyone else who took part. Two-sided matches have exactly one. */
  opponentIds: EntrantId[];
  kind: ResultKind;
  pointsFor: number;
  pointsAgainst: number;
  /** Points this appearance contributed to the entrant's total. */
  competitionPoints: number;
  bonusPoints: number;
}

export interface EntrantRecord {
  entrantId: EntrantId;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  pointsFor: number;
  pointsAgainst: number;
  competitionPoints: number;
  bonusPoints: number;
  /** What the entrant began on. Zero unless a starting-score rule is in use. */
  startingPoints: number;
  appearances: MatchAppearance[];
}

function emptyRecord(entrantId: EntrantId): EntrantRecord {
  return {
    entrantId,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    byes: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    competitionPoints: 0,
    bonusPoints: 0,
    startingPoints: 0,
    appearances: [],
  };
}

/** Which tier a side finished in, and how many shared it. */
function placeOf(outcome: NormalizedOutcome, sideIndex: number): { tier: number; shared: number } {
  for (let tier = 0; tier < outcome.places.length; tier += 1) {
    const group = outcome.places[tier];
    if (group?.includes(sideIndex)) return { tier, shared: group.length };
  }
  return { tier: outcome.places.length, shared: 1 };
}

function resultKindOf(outcome: NormalizedOutcome, sideIndex: number): ResultKind {
  const { tier, shared } = placeOf(outcome, sideIndex);
  if (tier > 0) return "loss";
  return shared > 1 ? "draw" : "win";
}

/**
 * Points conceded.
 *
 * For a two-sided match this is exactly the opponent's score. For a free-for-all
 * it is the mean of the other sides, which keeps point difference comparable
 * between matches with different numbers of participants.
 */
function concededBy(outcome: NormalizedOutcome, sideIndex: number, sideCount: number): number {
  if (!outcome.pointsFor || sideCount < 2) return 0;
  let total = 0;
  for (let i = 0; i < sideCount; i += 1) {
    if (i !== sideIndex) total += outcome.pointsFor[i] ?? 0;
  }
  return total / (sideCount - 1);
}

function bonusPointsFor(
  system: PointsSystem,
  outcome: NormalizedOutcome,
  sideIndex: number,
  sideCount: number,
  kind: ResultKind,
): number {
  if (system.bonusRules.length === 0 || !outcome.pointsFor) return 0;

  const scored = outcome.pointsFor[sideIndex] ?? 0;
  const conceded = concededBy(outcome, sideIndex, sideCount);
  const margin = scored - conceded;
  const opponentsScoredNothing = outcome.pointsFor.every(
    (value, i) => i === sideIndex || value === 0,
  );

  let total = 0;
  for (const rule of system.bonusRules) {
    const c = rule.condition;
    const earned =
      c.kind === "win_margin_at_least"
        ? kind === "win" && margin >= c.value
        : c.kind === "loss_margin_at_most"
          ? kind === "loss" && -margin <= c.value
          : c.kind === "points_for_at_least"
            ? scored >= c.value
            : /* shutout */ kind === "win" && opponentsScoredNothing;
    if (earned) total += rule.points;
  }
  return total;
}

/** Base competition points before bonuses. */
function awardFor(
  system: PointsSystem,
  kind: ResultKind,
  overtime: boolean,
  forfeited: boolean,
  opponentForfeited: boolean,
): number {
  if (forfeited) return system.forfeitLoss;
  if (opponentForfeited && kind === "win") return system.forfeitWin;
  if (kind === "bye") return system.bye;

  if (overtime) {
    if (kind === "win" && system.overtimeWin !== null) return system.overtimeWin;
    if (kind === "loss" && system.overtimeLoss !== null) return system.overtimeLoss;
  }

  if (kind === "win") return system.win;
  if (kind === "draw") return system.draw;
  return system.loss;
}

/**
 * Build a record per entrant from a set of matches.
 *
 * The caller decides which matches count — a whole tournament, one stage, or one
 * group — which is what lets group tables and overall tables share this code.
 */
export function computeRecords(
  matches: readonly Match[],
  score: ScoreConfig,
  standings: StandingsConfig,
  entrantIds: readonly EntrantId[],
  /**
   * McMahon-style head starts. Unlike accelerated pairings, these count right
   * through to the final table, so they belong in the record rather than only
   * in the draw.
   */
  startingPoints: Map<EntrantId, number> = new Map(),
): Map<EntrantId, EntrantRecord> {
  const records = new Map<EntrantId, EntrantRecord>();
  for (const id of entrantIds) {
    const record = emptyRecord(id);
    record.startingPoints = startingPoints.get(id) ?? 0;
    record.competitionPoints = record.startingPoints;
    records.set(id, record);
  }

  const system = standings.pointsSystem;

  for (const match of matches) {
    if (match.status === "void") continue;
    const outcome = outcomeOfMatch(match, score);
    if (!outcome) continue;

    const sideCount = match.sides.length;

    match.sides.forEach((side, index) => {
      const entrantId = side.entrantId;
      if (!entrantId) return;
      const record = records.get(entrantId);
      if (!record) return;

      const isBye = match.status === "bye";
      const kind: ResultKind = isBye ? "bye" : resultKindOf(outcome, index);
      const forfeited = outcome.forfeitBy.includes(index);
      const opponentForfeited = outcome.forfeitBy.length > 0 && !forfeited;

      const scored = outcome.pointsFor?.[index] ?? 0;
      const conceded = concededBy(outcome, index, sideCount);
      const bonus = isBye ? 0 : bonusPointsFor(system, outcome, index, sideCount, kind);
      const base = awardFor(system, kind, outcome.overtime, forfeited, opponentForfeited);

      // Two ways of earning competition points, chosen by configuration:
      // by result (a win is worth 3) or by score (your finishing points count
      // directly, as in a Mario Kart cup or an athletics meeting).
      const earned = standings.pointsSource === "score" && !isBye ? scored : base;

      const opponentIds = match.sides
        .filter((_, i) => i !== index)
        .map((s) => s.entrantId)
        .filter((id): id is EntrantId => id !== null);

      record.appearances.push({
        matchId: match.id,
        opponentIds,
        kind,
        pointsFor: scored,
        pointsAgainst: conceded,
        competitionPoints: earned + bonus,
        bonusPoints: bonus,
      });

      if (isBye) record.byes += 1;
      else {
        record.played += 1;
        if (kind === "win") record.wins += 1;
        else if (kind === "draw") record.draws += 1;
        else record.losses += 1;
        record.pointsFor += scored;
        record.pointsAgainst += conceded;
      }

      record.competitionPoints += earned + bonus;
      record.bonusPoints += bonus;
    });
  }

  return records;
}
