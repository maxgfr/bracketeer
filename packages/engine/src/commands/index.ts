/**
 * Commands: the API the application drives the engine through.
 *
 * Everything here returns *events* rather than mutating anything. The caller
 * appends them to the log, and the new state falls out of replay. That is what
 * keeps a change made on a phone at the far end of a hall identical to the same
 * change made on the organiser's laptop.
 */

import type { StageConfig, TournamentConfigInput } from "../domain/config.js";
import type {
  Entrant,
  EntrantId,
  Group,
  Match,
  MatchResult,
  StageId,
  TournamentState,
} from "../domain/entities.js";
import { activeEntrants, matchesOfStage } from "../domain/entities.js";
import type { DomainEvent } from "../events/types.js";
import {
  buildDoubleElimination,
  buildSingleElimination,
  grandFinalResetMatch,
} from "../formats/elimination.js";
import { allocateGroups, selectQualifiers } from "../formats/groups.js";
import { buildRoundRobin } from "../formats/roundRobin.js";
import { buildSwissRound, defaultSwissRounds } from "../formats/swiss.js";
import { buildHistory } from "../pairing/history.js";
import { computeRatings, ratingValues } from "../rating/index.js";
import { outcomeOfMatch } from "../scoring/normalize.js";
import { computeStandings, groupStandings, stageStandings } from "../standings/index.js";
import { createRng, seedFromString } from "../util/rng.js";

/* ────────────────────────────────────────────────────────────────────────────
 * Setup
 * ──────────────────────────────────────────────────────────────────────────── */

export function createTournament(input: {
  name: string;
  config: TournamentConfigInput;
  seed: number;
  createdAt: string;
}): DomainEvent {
  return {
    type: "tournament_created",
    name: input.name,
    config: input.config,
    seed: input.seed,
    createdAt: input.createdAt,
  };
}

export function addEntrant(entrant: Partial<Entrant> & { id: EntrantId; name: string }): DomainEvent {
  return {
    type: "entrant_added",
    entrant: {
      seed: null,
      members: [],
      meta: {},
      status: "active",
      rating: null,
      ...entrant,
    },
  };
}

export function reportResult(matchId: string, result: MatchResult): DomainEvent {
  return { type: "result_reported", matchId, result };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Stage lifecycle
 * ──────────────────────────────────────────────────────────────────────────── */

/** A stage's own random stream, so one stage's draws cannot shift another's. */
function stageRng(state: TournamentState, stageId: StageId, salt = "") {
  return createRng(seedFromString(`${state.seed}:${stageId}:${salt}`));
}

function stageConfigOf(state: TournamentState, stageId: StageId): StageConfig | undefined {
  return state.config.stages.find((s) => s.id === stageId);
}

/** Entrants in seeded order: explicit seeds first, then entry order. */
function seededEntrants(state: TournamentState): EntrantId[] {
  return activeEntrants(state)
    .slice()
    .sort((a, b) => {
      if (a.seed !== null && b.seed !== null) return a.seed - b.seed;
      if (a.seed !== null) return -1;
      if (b.seed !== null) return 1;
      return 0;
    })
    .map((e) => e.id);
}

/**
 * Who enters a stage: the whole field for the first one, and whoever came
 * through the previous stage for the rest.
 */
export function entrantsForStage(state: TournamentState, stageId: StageId): EntrantId[] {
  const index = state.config.stages.findIndex((s) => s.id === stageId);
  if (index <= 0) return seededEntrants(state);

  const previous = state.config.stages[index - 1];
  if (!previous) return seededEntrants(state);
  return qualifiersFrom(state, previous.id);
}

/** The entrants a completed stage sends forward, in finishing order. */
export function qualifiersFrom(state: TournamentState, stageId: StageId): EntrantId[] {
  const config = stageConfigOf(state, stageId);
  const runtime = state.stages.find((s) => s.id === stageId);
  if (!config || !runtime) return [];

  const ratings = ratingValues(computeRatings(state));

  if (config.kind === "groups" && runtime.groups.length > 0) {
    const rankings = runtime.groups.map((group) => ({
      groupId: group.id,
      ordered: groupStandings(state, stageId, group.id, { ratings }).map((r) => r.entrantId),
    }));
    return selectQualifiers(rankings, {
      perGroup: config.qualification.perGroup,
      bestOfRest: config.qualification.bestOfRest,
      total: config.qualification.count,
    });
  }

  const ordered = stageStandings(state, stageId, { ratings }).map((r) => r.entrantId);
  const limit = config.qualification.count;
  return limit && limit > 0 ? ordered.slice(0, limit) : ordered;
}

/** Group the built fixtures by round, so each round is its own event. */
function roundEvents(stageId: StageId, matches: readonly Match[]): DomainEvent[] {
  const byRound = new Map<number, Match[]>();
  for (const match of matches) {
    const bucket = byRound.get(match.roundIndex) ?? [];
    bucket.push(match);
    byRound.set(match.roundIndex, bucket);
  }

  return [...byRound.keys()]
    .sort((a, b) => a - b)
    .map((roundIndex) => ({
      type: "round_generated" as const,
      stageId,
      roundIndex,
      matches: byRound.get(roundIndex) ?? [],
    }));
}

function buildStageMatches(
  state: TournamentState,
  config: StageConfig,
  entrantIds: readonly EntrantId[],
  groups: readonly Group[],
): Match[] {
  const stageId = config.id;
  const rng = stageRng(state, stageId, "draw");
  const hasHomeSide = state.config.match.hasHomeSide;

  switch (config.kind) {
    case "single_elimination":
      return buildSingleElimination({
        stageId,
        entrantIds,
        seeding: config.seeding,
        consolation: config.consolation,
        rng,
        hasHomeSide,
      });

    case "double_elimination":
      return buildDoubleElimination({
        stageId,
        entrantIds,
        seeding: config.seeding,
        consolation: config.consolation,
        grandFinalReset: config.grandFinalReset,
        rng,
        hasHomeSide,
      });

    case "round_robin":
      return buildRoundRobin({
        stageId,
        entrantIds,
        legs: config.legs,
        mirrorLegs: config.mirrorLegs,
        hasHomeSide,
      });

    case "swiss":
    case "ladder":
      // Both produce fixtures as they go: a Swiss pairing depends on results so
      // far, and a ladder on who challenges whom.
      return [];

    case "groups":
      return groups.flatMap((group) => {
        const inner = { ...config.inner, id: stageId } as StageConfig;
        return buildStageMatches(state, inner, group.entrantIds, []).map((match) => ({
          ...match,
          groupId: group.id,
          id: match.id.replace(`${stageId}.`, `${stageId}.${group.id}.`),
        }));
      });
  }
}

/**
 * Open a stage: work out who is in it, split it into groups if it has any, and
 * lay out whatever fixtures can be known in advance.
 */
export function startStage(state: TournamentState, stageId: StageId): DomainEvent[] {
  const config = stageConfigOf(state, stageId);
  if (!config) return [];
  if (state.stages.some((s) => s.id === stageId && s.started)) return [];

  const entrantIds = entrantsForStage(state, stageId);
  if (entrantIds.length === 0) return [];

  const groups: Group[] =
    config.kind === "groups"
      ? allocateGroups(entrantIds, {
          groupCount: config.groupCount,
          groupSize: config.groupSize,
          distribution: config.distribution,
          rng: stageRng(state, stageId, "groups"),
        })
      : [];

  const started: DomainEvent = { type: "stage_started", stageId, entrantIds, groups };

  if (config.kind === "swiss") {
    // A Swiss stage needs its first round drawn now; the rest follow results.
    return [started, ...swissRoundEvents(state, config, entrantIds, groups, 0)];
  }

  return [started, ...roundEvents(stageId, buildStageMatches(state, config, entrantIds, groups))];
}

function swissRoundEvents(
  state: TournamentState,
  config: StageConfig,
  entrantIds: readonly EntrantId[],
  groups: readonly Group[],
  roundIndex: number,
): DomainEvent[] {
  const stageId = config.id;
  const ratings = ratingValues(computeRatings(state));
  const pairing = config.pairing ?? state.config.pairing;
  const meta = new Map(state.entrants.map((e) => [e.id, e.meta]));

  const build = (ids: readonly EntrantId[], groupId: string | null): Match[] => {
    const relevant = matchesOfStage(state, stageId).filter(
      (m) => (groupId === null ? true : m.groupId === groupId),
    );
    const points = new Map(
      computeStandings(state, relevant, ids, { ratings }).map((row) => [
        row.entrantId,
        row.record.competitionPoints,
      ]),
    );

    return buildSwissRound({
      stageId,
      roundIndex,
      entrantIds: ids,
      sidesPerMatch: state.config.match.sidesPerMatch,
      pairing,
      history: buildHistory(relevant),
      points,
      ratings,
      meta,
      rng: stageRng(state, stageId, `round${roundIndex}`),
      hasHomeSide: state.config.match.hasHomeSide,
      groupId,
    }).matches;
  };

  const matches =
    groups.length > 0
      ? groups.flatMap((group) =>
          build(group.entrantIds, group.id).map((match) => ({
            ...match,
            id: match.id.replace(`${stageId}.`, `${stageId}.${group.id}.`),
          })),
        )
      : build(entrantIds, null);

  return matches.length > 0 ? [{ type: "round_generated", stageId, roundIndex, matches }] : [];
}

/** How many rounds a Swiss stage should run. */
export function swissRoundTarget(config: StageConfig, entrantCount: number): number {
  if (config.kind !== "swiss") return 0;
  return config.rounds ?? defaultSwissRounds(entrantCount);
}

/** Every fixture in a stage that is still waiting to be played. */
export function outstandingMatches(state: TournamentState, stageId: StageId): Match[] {
  return matchesOfStage(state, stageId).filter(
    (m) => m.status === "ready" || m.status === "pending",
  );
}

/**
 * Move a stage on: draw the next Swiss round, or add the deciding match a
 * double elimination has just earned. Returns nothing when there is nothing to
 * do, which is also how the caller knows a stage is waiting on results.
 */
export function advanceStage(state: TournamentState, stageId: StageId): DomainEvent[] {
  const config = stageConfigOf(state, stageId);
  const runtime = state.stages.find((s) => s.id === stageId);
  if (!config || !runtime) return [];

  if (config.kind === "swiss") {
    if (outstandingMatches(state, stageId).length > 0) return [];
    const target = swissRoundTarget(config, runtime.entrantIds.length);
    if (runtime.roundsGenerated >= target) return [];
    return swissRoundEvents(state, config, runtime.entrantIds, runtime.groups, runtime.roundsGenerated);
  }

  if (config.kind === "double_elimination" && config.grandFinalReset) {
    return grandFinalResetEvents(state, stageId);
  }

  return [];
}

/**
 * The lower-bracket entrant has beaten the unbeaten one. Both now have a single
 * defeat, so the bracket owes them a decider.
 */
function grandFinalResetEvents(state: TournamentState, stageId: StageId): DomainEvent[] {
  const matches = matchesOfStage(state, stageId);
  const grandFinal = matches.find((m) => m.bracket === "grand_final" && m.roundIndex >= 0 && m.order === 0);
  if (!grandFinal || grandFinal.status !== "complete") return [];
  if (matches.some((m) => m.id.endsWith("grand_final.r1.m0"))) return [];

  const outcome = outcomeOfMatch(grandFinal, state.config.score);
  // Side 1 is the entrant who came up through the lower bracket, by construction.
  if (!outcome || outcome.winner !== 1) return [];

  const reset = grandFinalResetMatch(stageId, grandFinal);
  return [
    { type: "round_generated", stageId, roundIndex: reset.roundIndex, matches: [reset] },
  ];
}

/** True when every fixture a stage will ever have has been played. */
export function isStageComplete(state: TournamentState, stageId: StageId): boolean {
  const config = stageConfigOf(state, stageId);
  const runtime = state.stages.find((s) => s.id === stageId);
  if (!config || !runtime?.started) return false;

  if (outstandingMatches(state, stageId).length > 0) return false;

  if (config.kind === "swiss") {
    return runtime.roundsGenerated >= swissRoundTarget(config, runtime.entrantIds.length);
  }
  if (config.kind === "ladder") return false; // A ladder has no end.
  if (config.kind === "double_elimination" && config.grandFinalReset) {
    return grandFinalResetEvents(state, stageId).length === 0;
  }

  return matchesOfStage(state, stageId).length > 0;
}

/** The next stage waiting to be opened, if the one before it has finished. */
export function nextStageToStart(state: TournamentState): StageId | null {
  for (const stage of state.config.stages) {
    const runtime = state.stages.find((s) => s.id === stage.id);
    if (!runtime?.started) {
      const index = state.config.stages.findIndex((s) => s.id === stage.id);
      if (index === 0) return stage.id;
      const previous = state.config.stages[index - 1];
      return previous && isStageComplete(state, previous.id) ? stage.id : null;
    }
  }
  return null;
}
