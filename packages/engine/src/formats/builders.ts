/**
 * Shared construction helpers for format builders.
 */

import type {
  BracketSlot,
  EntrantId,
  Match,
  MatchId,
  Side,
  SideSource,
  StageId,
} from "../domain/entities.js";

export function matchId(
  stageId: StageId,
  bracket: BracketSlot,
  round: number,
  order: number,
  groupId?: string | null,
): MatchId {
  const group = groupId ? `${groupId}.` : "";
  return `${stageId}.${group}${bracket}.r${round}.m${order}`;
}

export function slot(entrantId: EntrantId | null, isHome = false): Side {
  return { entrantId, source: null, isHome };
}

export function fedBy(source: SideSource, isHome = false): Side {
  return { entrantId: null, source, isHome };
}

export function winnerOf(id: MatchId, isHome = false): Side {
  return fedBy({ from: "winner", matchId: id }, isHome);
}

export function loserOf(id: MatchId, isHome = false): Side {
  return fedBy({ from: "loser", matchId: id }, isHome);
}

export interface MatchDraft {
  id: MatchId;
  stageId: StageId;
  bracket: BracketSlot;
  roundIndex: number;
  order: number;
  sides: Side[];
  label?: string | null;
  groupId?: string | null;
}

export function draft(input: MatchDraft): Match {
  return {
    id: input.id,
    stageId: input.stageId,
    groupId: input.groupId ?? null,
    bracket: input.bracket,
    roundIndex: input.roundIndex,
    order: input.order,
    sides: input.sides,
    result: null,
    scheduledAt: null,
    venueId: null,
    status: "pending",
    label: input.label ?? null,
  };
}

/**
 * The conventional name for a knockout round, counting back from the final.
 * `roundsRemaining` is 1 for the final itself.
 */
export function knockoutRoundLabel(roundsRemaining: number): string {
  if (roundsRemaining <= 1) return "Final";
  if (roundsRemaining === 2) return "Semi-final";
  if (roundsRemaining === 3) return "Quarter-final";
  return `Round of ${2 ** roundsRemaining}`;
}
