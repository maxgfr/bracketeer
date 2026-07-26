/**
 * Swiss and other pairing-driven formats.
 *
 * Unlike a bracket or a Berger table, a Swiss round cannot be planned ahead:
 * who you play next depends on how everyone has done so far. Rounds are
 * therefore produced one at a time, and each is committed to the log as a
 * decision rather than as an instruction to re-derive later.
 *
 * This is also where a competitor who loses early keeps playing. There is no
 * elimination — a bad start costs you the leaders, not the tournament.
 */

import type { PairingConfig } from "../domain/config.js";
import type { EntrantId, Match, StageId } from "../domain/entities.js";
import { pairRound, type PairingHistory, type PairingOutcome } from "../pairing/index.js";
import type { Rng } from "../util/rng.js";
import { draft, matchId, slot } from "./builders.js";

export interface SwissRoundOptions {
  stageId: StageId;
  roundIndex: number;
  entrantIds: readonly EntrantId[];
  sidesPerMatch: number;
  pairing: PairingConfig;
  history: PairingHistory;
  /** Competition points so far, which is what score groups are built from. */
  points: Map<EntrantId, number>;
  ratings: Map<EntrantId, number>;
  meta: Map<EntrantId, Record<string, string>>;
  rng: Rng;
  hasHomeSide?: boolean;
  groupId?: string | null;
}

export interface SwissRound {
  matches: Match[];
  outcome: PairingOutcome;
}

export function buildSwissRound(options: SwissRoundOptions): SwissRound {
  const { stageId, roundIndex, groupId, hasHomeSide = false } = options;

  const outcome = pairRound({
    entrantIds: options.entrantIds,
    sidesPerMatch: options.sidesPerMatch,
    config: options.pairing,
    history: options.history,
    points: options.points,
    ratings: options.ratings,
    meta: options.meta,
    rng: options.rng,
  });

  const matches: Match[] = outcome.groups.map((group, order) =>
    draft({
      id: matchId(stageId, "main", roundIndex, order, groupId),
      stageId,
      groupId,
      bracket: "main",
      roundIndex,
      order,
      sides: group.map((id, i) => slot(id, hasHomeSide && i === 0)),
      label: `Round ${roundIndex + 1}`,
    }),
  );

  outcome.byes.forEach((entrantId, i) => {
    matches.push(
      draft({
        id: matchId(stageId, "main", roundIndex, outcome.groups.length + i, groupId),
        stageId,
        groupId,
        bracket: "main",
        roundIndex,
        order: outcome.groups.length + i,
        sides: [slot(entrantId, hasHomeSide), slot(null)],
        label: `Round ${roundIndex + 1}`,
      }),
    );
  });

  return { matches, outcome };
}

/**
 * How many rounds a Swiss event needs when the organiser has not said.
 *
 * ceil(log2(n)) is the point at which one entrant can be undefeated and the
 * field is separated enough to rank — the same reasoning behind a knockout's
 * round count, without knocking anybody out.
 */
export function defaultSwissRounds(entrantCount: number): number {
  if (entrantCount < 2) return 0;
  return Math.max(1, Math.ceil(Math.log2(entrantCount)));
}
