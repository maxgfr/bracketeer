/**
 * Round robins and leagues.
 *
 * Everyone meets everyone. The whole fixture list is built at once, which is
 * what a league needs: you cannot publish a season calendar that only exists
 * one matchday at a time.
 */

import type { EntrantId, Match, StageId } from "../domain/entities.js";
import { bergerLegs } from "../pairing/berger.js";
import { draft, matchId, slot } from "./builders.js";

export interface RoundRobinOptions {
  stageId: StageId;
  entrantIds: readonly EntrantId[];
  legs: number;
  mirrorLegs: boolean;
  hasHomeSide?: boolean;
  groupId?: string | null;
}

export function buildRoundRobin(options: RoundRobinOptions): Match[] {
  const { stageId, groupId, hasHomeSide = false } = options;
  if (options.entrantIds.length < 2) return [];

  const rounds = bergerLegs(options.entrantIds, Math.max(1, options.legs), options.mirrorLegs);
  const matches: Match[] = [];

  rounds.forEach((fixtures, roundIndex) => {
    // Whoever is not playing this round sits out. The engine records that as a
    // bye so the round is complete and the standings know why.
    const playing = new Set(fixtures.flat());
    const sittingOut = options.entrantIds.filter((id) => !playing.has(id));

    fixtures.forEach(([home, away], order) => {
      matches.push(
        draft({
          id: matchId(stageId, "main", roundIndex, order, groupId),
          stageId,
          groupId,
          bracket: "main",
          roundIndex,
          order,
          sides: [slot(home, hasHomeSide), slot(away)],
          label: `Round ${roundIndex + 1}`,
        }),
      );
    });

    sittingOut.forEach((id, i) => {
      matches.push(
        draft({
          id: matchId(stageId, "main", roundIndex, fixtures.length + i, groupId),
          stageId,
          groupId,
          bracket: "main",
          roundIndex,
          order: fixtures.length + i,
          sides: [slot(id, hasHomeSide), slot(null)],
          label: `Round ${roundIndex + 1}`,
        }),
      );
    });
  });

  return matches;
}

/** How many rounds a round robin of this size takes. */
export function roundRobinRoundCount(entrantCount: number, legs: number): number {
  if (entrantCount < 2) return 0;
  const perLeg = entrantCount % 2 === 0 ? entrantCount - 1 : entrantCount;
  return perLeg * Math.max(1, legs);
}
