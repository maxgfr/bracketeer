import type { Entrant, Match, Side } from "../src/domain/entities.js";
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
