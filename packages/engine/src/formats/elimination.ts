/**
 * Elimination brackets.
 *
 * The whole structure is built up front, with empty slots wired to the match
 * that will fill them. Results then flow through those links automatically, so
 * no round ever has to be "generated" — which also means an organiser can look
 * at the full draw before a ball is thrown.
 *
 * Consolation policies are what answer the complaint that gives knockouts a bad
 * name: losing your first match to the eventual winner and going home. Every
 * policy here is a different answer to "and then what?".
 */

import type { Consolation, Seeding } from "../domain/config.js";
import type { EntrantId, Match, MatchId, StageId } from "../domain/entities.js";
import { bracketSize, seedIntoBracket } from "../pairing/seeding.js";
import type { Rng } from "../util/rng.js";
import {
  draft,
  knockoutRoundLabel,
  loserOf,
  matchId,
  slot,
  winnerOf,
  type MatchDraft,
} from "./builders.js";

export interface EliminationOptions {
  stageId: StageId;
  entrantIds: readonly EntrantId[];
  seeding: Seeding;
  consolation: Consolation;
  rng: Rng;
  hasHomeSide?: boolean;
  groupId?: string | null;
}

/** The main knockout tree. Round 0 holds the seeded entrants; later rounds are wired to it. */
function buildMainBracket(options: EliminationOptions): Match[] {
  const { stageId, groupId } = options;
  const slots = seedIntoBracket(
    options.entrantIds,
    options.seeding.method,
    options.rng,
    options.seeding.slots,
  );
  const size = slots.length;
  if (size < 2) return [];

  const rounds = Math.log2(size);
  const matches: Match[] = [];

  for (let round = 0; round < rounds; round += 1) {
    const count = size / 2 ** (round + 1);
    for (let order = 0; order < count; order += 1) {
      const id = matchId(stageId, "main", round, order, groupId);
      const sides =
        round === 0
          ? [
              slot(slots[order * 2] ?? null, options.hasHomeSide),
              slot(slots[order * 2 + 1] ?? null),
            ]
          : [
              winnerOf(matchId(stageId, "main", round - 1, order * 2, groupId), options.hasHomeSide),
              winnerOf(matchId(stageId, "main", round - 1, order * 2 + 1, groupId)),
            ];

      matches.push(
        draft({
          id,
          stageId,
          groupId,
          bracket: "main",
          roundIndex: round,
          order,
          sides,
          label: knockoutRoundLabel(rounds - round),
        }),
      );
    }
  }

  return matches;
}

/** The play-off between the two beaten semi-finalists. */
function buildThirdPlace(options: EliminationOptions, size: number): Match[] {
  if (size < 4) return [];
  const { stageId, groupId } = options;
  const semiRound = Math.log2(size) - 2;

  return [
    draft({
      id: matchId(stageId, "third_place", 0, 0, groupId),
      stageId,
      groupId,
      bracket: "third_place",
      // Played alongside the final.
      roundIndex: Math.log2(size) - 1,
      order: 1,
      sides: [
        loserOf(matchId(stageId, "main", semiRound, 0, groupId), options.hasHomeSide),
        loserOf(matchId(stageId, "main", semiRound, 1, groupId)),
      ],
      label: "Third place",
    }),
  ];
}

/**
 * The *consolante*: a full knockout for everyone beaten in the first round.
 *
 * This is the direct answer to drawing the champion in round one. You lose, you
 * drop into a bracket of the other first-round losers, and you still have a
 * tournament to play — which is how pétanque concours have always worked.
 */
function buildConsolation(options: EliminationOptions, size: number): Match[] {
  const firstRoundMatches = size / 2;
  if (firstRoundMatches < 2) return [];

  const { stageId, groupId } = options;
  const consolationSize = bracketSize(firstRoundMatches);
  const rounds = Math.log2(consolationSize);
  const matches: Match[] = [];

  for (let round = 0; round < rounds; round += 1) {
    const count = consolationSize / 2 ** (round + 1);
    for (let order = 0; order < count; order += 1) {
      const sides =
        round === 0
          ? [
              loserOf(matchId(stageId, "main", 0, order * 2, groupId), options.hasHomeSide),
              loserOf(matchId(stageId, "main", 0, order * 2 + 1, groupId)),
            ]
          : [
              winnerOf(
                matchId(stageId, "consolation", round - 1, order * 2, groupId),
                options.hasHomeSide,
              ),
              winnerOf(matchId(stageId, "consolation", round - 1, order * 2 + 1, groupId)),
            ];

      matches.push(
        draft({
          id: matchId(stageId, "consolation", round, order, groupId),
          stageId,
          groupId,
          bracket: "consolation",
          roundIndex: round,
          order,
          sides,
          label: `Consolation ${knockoutRoundLabel(rounds - round).toLowerCase()}`,
        }),
      );
    }
  }

  return matches;
}

/**
 * The lower bracket.
 *
 * Rounds alternate between two shapes. A *minor* round pairs survivors against
 * each other and halves the field. A *major* round takes the entrants just
 * beaten in the upper bracket and feeds them in. Dropdowns are paired in
 * reverse order, which is what keeps beaten entrants from immediately replaying
 * the person who beat them.
 */
function buildLowerBracket(
  stageId: StageId,
  size: number,
  groupId: string | null | undefined,
  hasHomeSide: boolean,
): Match[] {
  const upperRounds = Math.log2(size);
  if (upperRounds < 2) return [];

  const matches: Match[] = [];
  const lowerRounds = 2 * upperRounds - 2;

  // Round 0 is fed entirely by the losers of upper round 0.
  let previousCount = size / 4;
  for (let order = 0; order < previousCount; order += 1) {
    matches.push(
      draft({
        id: matchId(stageId, "lower", 0, order, groupId),
        stageId,
        groupId,
        bracket: "lower",
        roundIndex: 0,
        order,
        sides: [
          loserOf(matchId(stageId, "main", 0, order * 2, groupId), hasHomeSide),
          loserOf(matchId(stageId, "main", 0, order * 2 + 1, groupId)),
        ],
        label: "Lower round 1",
      }),
    );
  }

  for (let round = 1; round < lowerRounds; round += 1) {
    const isMajor = round % 2 === 1;
    const count = isMajor ? previousCount : previousCount / 2;

    for (let order = 0; order < count; order += 1) {
      const sides = isMajor
        ? [
            winnerOf(matchId(stageId, "lower", round - 1, order, groupId), hasHomeSide),
            // Reversed, so the entrant who just dropped down does not meet the
            // same opponent twice in a row.
            loserOf(
              matchId(stageId, "main", (round + 1) / 2, count - 1 - order, groupId),
            ),
          ]
        : [
            winnerOf(matchId(stageId, "lower", round - 1, order * 2, groupId), hasHomeSide),
            winnerOf(matchId(stageId, "lower", round - 1, order * 2 + 1, groupId)),
          ];

      matches.push(
        draft({
          id: matchId(stageId, "lower", round, order, groupId),
          stageId,
          groupId,
          bracket: "lower",
          roundIndex: round,
          order,
          sides,
          label: round === lowerRounds - 1 ? "Lower final" : `Lower round ${round + 1}`,
        }),
      );
    }

    previousCount = count;
  }

  return matches;
}

export function buildSingleElimination(options: EliminationOptions): Match[] {
  const main = buildMainBracket(options);
  if (main.length === 0) return main;

  const size = bracketSize(options.entrantIds.length);
  const { stageId, groupId, hasHomeSide = false } = options;

  switch (options.consolation) {
    case "none":
      return main;
    case "third_place":
      return [...main, ...buildThirdPlace(options, size)];
    case "full_consolation":
      return [...main, ...buildConsolation(options, size)];
    case "repechage": {
      // Everyone beaten anywhere in the main draw gets a second path, and the
      // survivor earns a place in the final — the judo and rowing model.
      const lower = buildLowerBracket(stageId, size, groupId, hasHomeSide);
      const lastLower = lower[lower.length - 1];
      const mainFinal = main[main.length - 1];
      if (!lastLower || !mainFinal) return main;

      const decider = draft({
        id: matchId(stageId, "grand_final", 0, 0, groupId),
        stageId,
        groupId,
        bracket: "grand_final",
        roundIndex: Math.log2(size),
        order: 0,
        sides: [winnerOf(mainFinal.id, hasHomeSide), winnerOf(lastLower.id)],
        label: "Grand final",
      });
      return [...main, ...lower, decider];
    }
  }
}

export function buildDoubleElimination(
  options: EliminationOptions & { grandFinalReset: boolean },
): Match[] {
  const main = buildMainBracket(options);
  if (main.length === 0) return main;

  const size = bracketSize(options.entrantIds.length);
  const { stageId, groupId, hasHomeSide = false } = options;
  const lower = buildLowerBracket(stageId, size, groupId, hasHomeSide);

  const upperFinal = main[main.length - 1];
  const lowerFinal = lower[lower.length - 1];
  if (!upperFinal || !lowerFinal) return main;

  // Side 0 is the unbeaten entrant, side 1 the one who came up through the
  // lower bracket. `advanceStage` relies on that order to decide whether a
  // reset match is needed.
  const grandFinal = draft({
    id: matchId(stageId, "grand_final", 0, 0, groupId),
    stageId,
    groupId,
    bracket: "grand_final",
    roundIndex: Math.log2(size),
    order: 0,
    sides: [winnerOf(upperFinal.id, hasHomeSide), winnerOf(lowerFinal.id)],
    label: "Grand final",
  });

  const extra: Match[] =
    options.consolation === "third_place" ? buildThirdPlace(options, size) : [];

  return [...main, ...lower, grandFinal, ...extra];
}

/**
 * The second grand final, played only when the entrant from the lower bracket
 * wins the first — at which point both have one defeat and the bracket owes
 * them a decider.
 *
 * Created on demand rather than up front, because a match that usually is not
 * played has no business sitting in the draw looking like a fixture.
 */
export function grandFinalResetMatch(
  stageId: StageId,
  grandFinal: Match,
  groupId?: string | null,
): Match {
  return draft({
    id: matchId(stageId, "grand_final", 1, 0, groupId),
    stageId,
    groupId,
    bracket: "grand_final",
    roundIndex: grandFinal.roundIndex + 1,
    order: 0,
    sides: [
      { entrantId: grandFinal.sides[1]?.entrantId ?? null, source: null, isHome: false },
      { entrantId: grandFinal.sides[0]?.entrantId ?? null, source: null, isHome: false },
    ],
    label: "Grand final (reset)",
  } satisfies MatchDraft);
}

/** Every match id an elimination stage will ever contain, for progress reporting. */
export function eliminationMatchIds(matches: readonly Match[]): MatchId[] {
  return matches.map((m) => m.id);
}
