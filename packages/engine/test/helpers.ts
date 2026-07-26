import type { TournamentConfigInput } from "../src/domain/config.js";
import type { Entrant, Match, Side, TournamentState } from "../src/domain/entities.js";
import { replay } from "../src/events/reducer.js";
import { appendEvent, type EventEnvelope, type DomainEvent } from "../src/events/types.js";

export function entrant(id: string, over: Partial<Entrant> = {}): Entrant {
  return {
    id,
    name: id,
    seed: null,
    members: [],
    meta: {},
    status: "active",
    rating: null,
    ...over,
  };
}

export function side(entrantId: string | null, over: Partial<Side> = {}): Side {
  return { entrantId, source: null, isHome: false, ...over };
}

export function match(id: string, sides: Side[], over: Partial<Match> = {}): Match {
  return {
    id,
    stageId: "main",
    groupId: null,
    bracket: "main",
    roundIndex: 0,
    order: 0,
    sides,
    result: null,
    scheduledAt: null,
    venueId: null,
    status: "pending",
    label: null,
    ...over,
  };
}

/** Build a log by appending events in order, as a single actor would. */
export function logOf(actor: string, events: DomainEvent[], startAt = 1_000): EventEnvelope[] {
  let log: EventEnvelope[] = [];
  events.forEach((event, i) => {
    log = appendEvent(log, actor, event, startAt + i);
  });
  return log;
}

/**
 * Assemble a state the way the app does — through the log — rather than by
 * constructing one directly, so tests exercise the real path.
 */
export function buildState(
  config: TournamentConfigInput,
  entrantIds: readonly string[],
  matches: readonly Match[],
): TournamentState {
  return replay(
    logOf("t", [
      {
        type: "tournament_created",
        name: "Test",
        seed: 7,
        createdAt: "2026-01-01T00:00:00.000Z",
        config,
      },
      ...entrantIds.map((id) => ({ type: "entrant_added" as const, entrant: entrant(id) })),
      {
        type: "stage_started",
        stageId: "main",
        entrantIds: [...entrantIds],
        groups: [],
      },
      { type: "round_generated", stageId: "main", roundIndex: 0, matches: [...matches] },
    ]),
  );
}

/** A completed two-sided fixture with a points scoreline. */
export function played(
  id: string,
  home: string,
  away: string,
  homeScore: number,
  awayScore: number,
  over: Partial<Match> = {},
): Match {
  return match(id, [side(home), side(away)], {
    status: "complete",
    result: { kind: "points", scores: [homeScore, awayScore] },
    ...over,
  });
}
