/**
 * Stepladder and Page playoff.
 *
 * Both are small finishes that reward finishing top of the preceding stage far
 * more heavily than a bracket does. They exist because a plain knockout treats
 * the team that topped a 20-week league exactly like the team that scraped in
 * fourth, and several sports decided long ago that this was wrong.
 */

import type { EntrantId, Match, StageId } from "../domain/entities.js";
import { draft, matchId, slot, winnerOf, loserOf } from "./builders.js";

/**
 * A stepladder: the two lowest qualifiers play, and the winner climbs one rung
 * at a time until somebody beats the top seed.
 *
 * Bowling finals work exactly this way. The leader plays once; the fifth seed
 * has to win four times.
 */
export function buildStepladder(options: {
  stageId: StageId;
  entrantIds: readonly EntrantId[];
  rungs: number | null;
  hasHomeSide?: boolean;
  groupId?: string | null;
}): Match[] {
  const { stageId, groupId, hasHomeSide = false } = options;
  const climbers =
    options.rungs && options.rungs > 0
      ? options.entrantIds.slice(0, options.rungs)
      : options.entrantIds.slice();

  if (climbers.length < 2) return [];

  // Climbed from the bottom: the last two seeds meet first.
  const ladder = climbers.slice().reverse();
  const matches: Match[] = [];

  for (let round = 0; round + 1 < ladder.length; round += 1) {
    const challenger =
      round === 0
        ? slot(ladder[0] as EntrantId, hasHomeSide)
        : winnerOf(matchId(stageId, "main", round - 1, 0, groupId), hasHomeSide);
    const defender = slot(ladder[round + 1] as EntrantId);
    const isLast = round + 2 === ladder.length;

    matches.push(
      draft({
        id: matchId(stageId, "main", round, 0, groupId),
        stageId,
        groupId,
        bracket: "main",
        roundIndex: round,
        order: 0,
        sides: [challenger, defender],
        label: isLast ? "Final" : `Step ${round + 1}`,
      }),
    );
  }

  return matches;
}

/**
 * The Page playoff, as used in curling, softball and several cricket
 * competitions.
 *
 *   1 v 2  — the winner goes straight to the final
 *   3 v 4  — the loser is out, in fourth
 *   loser of (1 v 2) v winner of (3 v 4) — the winner joins the final, the loser is third
 *   the final
 *
 * The point is that finishing first or second earns a second chance, without the
 * length of a full double elimination.
 */
export function buildPagePlayoff(options: {
  stageId: StageId;
  entrantIds: readonly EntrantId[];
  hasHomeSide?: boolean;
  groupId?: string | null;
}): Match[] {
  const { stageId, groupId, hasHomeSide = false } = options;
  const [first, second, third, fourth] = options.entrantIds;
  if (!first || !second || !third || !fourth) return [];

  const oneTwo = matchId(stageId, "main", 0, 0, groupId);
  const threeFour = matchId(stageId, "main", 0, 1, groupId);
  const semi = matchId(stageId, "main", 1, 0, groupId);

  return [
    draft({
      id: oneTwo,
      stageId,
      groupId,
      bracket: "main",
      roundIndex: 0,
      order: 0,
      sides: [slot(first, hasHomeSide), slot(second)],
      label: "One v two",
    }),
    draft({
      id: threeFour,
      stageId,
      groupId,
      bracket: "main",
      roundIndex: 0,
      order: 1,
      sides: [slot(third, hasHomeSide), slot(fourth)],
      label: "Three v four",
    }),
    draft({
      id: semi,
      stageId,
      groupId,
      bracket: "main",
      roundIndex: 1,
      order: 0,
      sides: [loserOf(oneTwo, hasHomeSide), winnerOf(threeFour)],
      label: "Semi-final",
    }),
    draft({
      id: matchId(stageId, "main", 2, 0, groupId),
      stageId,
      groupId,
      bracket: "main",
      roundIndex: 2,
      order: 0,
      sides: [winnerOf(oneTwo, hasHomeSide), winnerOf(semi)],
      label: "Final",
    }),
  ];
}
