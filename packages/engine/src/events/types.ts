/**
 * The event log.
 *
 * A tournament is not stored as state — it is stored as the append-only list of
 * things that happened, and the state is recomputed by folding that list. This
 * single choice pays for itself four times over:
 *
 *   · the log compresses far smaller than derived state, so it fits in a URL
 *   · two peers merge by taking the union of their events, with no conflict
 *     resolution to get wrong, because replay is deterministic
 *   · undo is just dropping the last event
 *   · a tournament is reproducible, which makes it testable against fixtures
 *
 * Note that `round_generated` carries fully materialised matches rather than a
 * pairing instruction. Pairing depends on standings, ratings and drawn lots at
 * the moment it runs, so the *decision* is what gets recorded. The organiser can
 * therefore also override a pairing by hand without the log lying about it.
 */

import type { TournamentConfigInput } from "../domain/config.js";
import type {
  Entrant,
  EntrantId,
  Group,
  Match,
  MatchId,
  MatchResult,
  StageId,
} from "../domain/entities.js";

export type DomainEvent =
  | {
      type: "tournament_created";
      name: string;
      /** Seeds every deterministic draw for the life of the tournament. */
      seed: number;
      createdAt: string;
      config: TournamentConfigInput;
    }
  | { type: "tournament_renamed"; name: string }
  | { type: "config_replaced"; config: TournamentConfigInput }
  | { type: "entrant_added"; entrant: Entrant }
  | { type: "entrant_updated"; id: EntrantId; patch: Partial<Omit<Entrant, "id">> }
  | { type: "entrant_removed"; id: EntrantId }
  | { type: "entrant_status_changed"; id: EntrantId; status: "active" | "withdrawn" }
  | { type: "stage_started"; stageId: StageId; entrantIds: EntrantId[]; groups: Group[] }
  | { type: "round_generated"; stageId: StageId; roundIndex: number; matches: Match[] }
  /** Undo a pairing that has not been played yet. */
  | { type: "round_discarded"; stageId: StageId; roundIndex: number }
  | { type: "result_reported"; matchId: MatchId; result: MatchResult }
  | { type: "result_cleared"; matchId: MatchId }
  | {
      type: "match_scheduled";
      matchId: MatchId;
      scheduledAt: string | null;
      venueId: string | null;
    }
  | { type: "match_voided"; matchId: MatchId; reason: string }
  | { type: "match_restored"; matchId: MatchId }
  /** Organiser override of who plays in a fixture. */
  | { type: "match_sides_overridden"; matchId: MatchId; entrantIds: (EntrantId | null)[] };

export type DomainEventType = DomainEvent["type"];

export interface EventEnvelope {
  /** `${actor}:${seq}` — unique without coordination, and stable across peers. */
  id: string;
  /** Which device or person produced this event. */
  actor: string;
  /** Monotonic per actor, starting at 1. */
  seq: number;
  /** Logical clock. Orders events across peers without trusting wall clocks. */
  lamport: number;
  /** Wall clock in epoch milliseconds. Displayed to humans, never used for ordering. */
  at: number;
  event: DomainEvent;
}

export type EventLog = readonly EventEnvelope[];

/**
 * Total order over events. Lamport first, then actor, then sequence — and since
 * `(actor, seq)` is unique, no two distinct events ever compare equal. That
 * totality is what makes every peer replay to identical state.
 */
export function compareEnvelopes(a: EventEnvelope, b: EventEnvelope): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.actor !== b.actor) return a.actor < b.actor ? -1 : 1;
  return a.seq - b.seq;
}

export function sortLog(log: EventLog): EventEnvelope[] {
  return log.slice().sort(compareEnvelopes);
}

/**
 * Merge two logs. Events are immutable and identified globally, so merging is
 * set union followed by a re-sort — order of arrival cannot change the result.
 */
export function mergeLogs(a: EventLog, b: EventLog): EventEnvelope[] {
  const byId = new Map<string, EventEnvelope>();
  for (const envelope of a) byId.set(envelope.id, envelope);
  for (const envelope of b) if (!byId.has(envelope.id)) byId.set(envelope.id, envelope);
  return sortLog([...byId.values()]);
}

/** Append an event to a log, assigning it a sequence number and Lamport stamp. */
export function appendEvent(
  log: EventLog,
  actor: string,
  event: DomainEvent,
  now: number,
): EventEnvelope[] {
  let maxLamport = 0;
  let maxSeq = 0;
  for (const envelope of log) {
    if (envelope.lamport > maxLamport) maxLamport = envelope.lamport;
    if (envelope.actor === actor && envelope.seq > maxSeq) maxSeq = envelope.seq;
  }
  const seq = maxSeq + 1;
  return sortLog([
    ...log,
    { id: `${actor}:${seq}`, actor, seq, lamport: maxLamport + 1, at: now, event },
  ]);
}

/** Drop the most recent event produced by this actor. */
export function undoLast(log: EventLog, actor: string): EventEnvelope[] {
  const mine = log.filter((e) => e.actor === actor);
  const last = mine[mine.length - 1];
  if (!last) return log.slice();
  return log.filter((e) => e.id !== last.id);
}
