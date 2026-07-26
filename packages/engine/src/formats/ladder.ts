/**
 * Challenge ladders.
 *
 * An ongoing ranking rather than an event with an end: you challenge someone a
 * few rungs above you, and beating them takes their place. There are no rounds
 * in the usual sense, so fixtures are created one challenge at a time.
 */

import type { EntrantId, Match, StageId, TournamentState } from "../domain/entities.js";
import { matchesOfStage } from "../domain/entities.js";
import { outcomeOfMatch } from "../scoring/normalize.js";
import { draft, matchId, slot } from "./builders.js";

/**
 * The current order of the ladder.
 *
 * Replayed from the starting order by walking every settled challenge in the
 * order it was played, so the standing is a pure function of the log like
 * everything else.
 */
export function ladderOrder(
  state: TournamentState,
  stageId: StageId,
  startingOrder: readonly EntrantId[],
  takeRungOnWin: boolean,
): EntrantId[] {
  const order = startingOrder.slice();

  const settled = matchesOfStage(state, stageId)
    .filter((m) => m.status === "complete")
    .sort((a, b) => a.roundIndex - b.roundIndex || a.order - b.order);

  for (const match of settled) {
    const outcome = outcomeOfMatch(match, state.config.score);
    if (!outcome || outcome.winner === null) continue;

    const winner = match.sides[outcome.winner]?.entrantId;
    const loser = match.sides[outcome.winner === 0 ? 1 : 0]?.entrantId;
    if (!winner || !loser) continue;

    const winnerRung = order.indexOf(winner);
    const loserRung = order.indexOf(loser);
    if (winnerRung < 0 || loserRung < 0) continue;
    // Only an upset moves anybody: beating someone below you changes nothing.
    if (winnerRung <= loserRung) continue;

    order.splice(winnerRung, 1);
    if (takeRungOnWin) {
      // The winner takes the loser's rung and everyone between shuffles down.
      order.splice(loserRung, 0, winner);
    } else {
      // A straight swap.
      order.splice(loserRung, 0, winner);
      const displaced = order.indexOf(loser, loserRung + 1);
      if (displaced >= 0) {
        order.splice(displaced, 1);
        order.splice(winnerRung, 0, loser);
      }
    }
  }

  return order;
}

/** Who an entrant is currently allowed to challenge. */
export function legalChallenges(
  order: readonly EntrantId[],
  challenger: EntrantId,
  range: number,
): EntrantId[] {
  const rung = order.indexOf(challenger);
  if (rung <= 0) return [];
  return order.slice(Math.max(0, rung - range), rung);
}

export function buildChallenge(
  stageId: StageId,
  challenger: EntrantId,
  defender: EntrantId,
  sequence: number,
): Match {
  return draft({
    id: matchId(stageId, "main", sequence, 0),
    stageId,
    bracket: "main",
    roundIndex: sequence,
    order: 0,
    sides: [slot(defender, true), slot(challenger)],
    label: "Challenge",
  });
}
