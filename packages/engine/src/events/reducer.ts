/**
 * Replay: the only way a `TournamentState` is ever produced.
 *
 * The fold is pure and total. Events that refer to things which no longer exist
 * are ignored rather than throwing, because a merged log can legitimately
 * contain an edit to an entrant another peer removed. Dropping such an event is
 * the same decision on every device, so peers stay in agreement.
 */

import { parseConfig, type TournamentConfig } from "../domain/config.js";
import type {
  Match,
  MatchStatus,
  Side,
  StageRuntime,
  TournamentState,
} from "../domain/entities.js";
import { loserEntrantId, winnerEntrantId } from "../scoring/normalize.js";
import type { DomainEvent, EventEnvelope, EventLog } from "./types.js";
import { sortLog } from "./types.js";

function emptyState(): TournamentState {
  return {
    id: "",
    name: "",
    createdAt: "",
    seed: 0,
    config: parseConfig({}),
    entrants: [],
    matches: [],
    stages: [],
  };
}

function stageRuntime(state: TournamentState, stageId: string): StageRuntime | undefined {
  return state.stages.find((s) => s.id === stageId);
}

/** Sort key that keeps matches in a stable, human-sensible display order. */
function matchOrder(a: Match, b: Match): number {
  if (a.stageId !== b.stageId) return a.stageId < b.stageId ? -1 : 1;
  if (a.roundIndex !== b.roundIndex) return a.roundIndex - b.roundIndex;
  if (a.bracket !== b.bracket) return a.bracket < b.bracket ? -1 : 1;
  return a.order - b.order;
}

function applyEvent(state: TournamentState, envelope: EventEnvelope): TournamentState {
  const event: DomainEvent = envelope.event;

  switch (event.type) {
    case "tournament_created":
      return {
        ...state,
        id: state.id || envelope.actor,
        name: event.name,
        seed: event.seed,
        createdAt: event.createdAt,
        config: parseConfig(event.config),
      };

    case "tournament_renamed":
      return { ...state, name: event.name };

    case "config_replaced":
      return { ...state, config: parseConfig(event.config) };

    case "entrant_added": {
      // Idempotent: a merged log may deliver the same entrant twice.
      if (state.entrants.some((e) => e.id === event.entrant.id)) return state;
      return { ...state, entrants: [...state.entrants, event.entrant] };
    }

    case "entrant_updated":
      return {
        ...state,
        entrants: state.entrants.map((e) =>
          e.id === event.id ? { ...e, ...event.patch, id: e.id } : e,
        ),
      };

    case "entrant_removed":
      return { ...state, entrants: state.entrants.filter((e) => e.id !== event.id) };

    case "entrant_status_changed":
      return {
        ...state,
        entrants: state.entrants.map((e) =>
          e.id === event.id ? { ...e, status: event.status } : e,
        ),
      };

    case "stage_started": {
      const runtime: StageRuntime = {
        id: event.stageId,
        started: true,
        entrantIds: event.entrantIds,
        groups: event.groups,
        roundsGenerated: 0,
      };
      const existing = stageRuntime(state, event.stageId);
      return {
        ...state,
        stages: existing
          ? state.stages.map((s) => (s.id === event.stageId ? { ...s, ...runtime, roundsGenerated: s.roundsGenerated } : s))
          : [...state.stages, runtime],
      };
    }

    case "round_generated": {
      const known = new Set(state.matches.map((m) => m.id));
      const added = event.matches.filter((m) => !known.has(m.id));
      const matches = [...state.matches, ...added].sort(matchOrder);
      return {
        ...state,
        matches,
        stages: state.stages.map((s) =>
          s.id === event.stageId
            ? { ...s, roundsGenerated: Math.max(s.roundsGenerated, event.roundIndex + 1) }
            : s,
        ),
      };
    }

    case "round_discarded": {
      const matches = state.matches.filter(
        (m) => !(m.stageId === event.stageId && m.roundIndex === event.roundIndex),
      );
      const remaining = matches.filter((m) => m.stageId === event.stageId);
      const rounds = remaining.reduce((max, m) => Math.max(max, m.roundIndex + 1), 0);
      return {
        ...state,
        matches,
        stages: state.stages.map((s) =>
          s.id === event.stageId ? { ...s, roundsGenerated: rounds } : s,
        ),
      };
    }

    case "result_reported":
      return {
        ...state,
        matches: state.matches.map((m) =>
          m.id === event.matchId ? { ...m, result: event.result } : m,
        ),
      };

    case "result_cleared":
      return {
        ...state,
        matches: state.matches.map((m) =>
          m.id === event.matchId ? { ...m, result: null } : m,
        ),
      };

    case "match_scheduled":
      return {
        ...state,
        matches: state.matches.map((m) =>
          m.id === event.matchId
            ? { ...m, scheduledAt: event.scheduledAt, venueId: event.venueId }
            : m,
        ),
      };

    case "match_voided":
      return {
        ...state,
        matches: state.matches.map((m) =>
          m.id === event.matchId ? { ...m, status: "void" as MatchStatus } : m,
        ),
      };

    case "match_restored":
      return {
        ...state,
        matches: state.matches.map((m) =>
          m.id === event.matchId ? { ...m, status: "pending" as MatchStatus } : m,
        ),
      };

    case "match_sides_overridden":
      return {
        ...state,
        matches: state.matches.map((m) =>
          m.id === event.matchId
            ? {
                ...m,
                sides: m.sides.map((side, i): Side => ({
                  ...side,
                  entrantId: event.entrantIds[i] ?? null,
                  // An explicit override detaches the slot from its feeder, or
                  // propagation would immediately undo the organiser's decision.
                  source: null,
                })),
              }
            : m,
        ),
      };
  }
}

/**
 * Fill slots whose occupant is decided by an earlier match, and recompute match
 * statuses.
 *
 * Runs to a fixed point rather than in one pass: a lower-bracket fixture can
 * depend on a main-bracket round that sorts after it, so a single ordered sweep
 * would leave stale slots behind.
 */
function propagate(state: TournamentState): TournamentState {
  const config: TournamentConfig = state.config;
  let matches = state.matches;

  for (let pass = 0; pass <= matches.length; pass += 1) {
    const byId = new Map(matches.map((m) => [m.id, m]));
    let changed = false;

    const next = matches.map((match): Match => {
      if (match.status === "void") return match;

      const sides = match.sides.map((side): Side => {
        // Qualifier slots are filled when the next stage starts, from the
        // previous stage's final standings, so there is nothing to propagate.
        if (!side.source || side.source.from === "qualifier") return side;
        const feeder = byId.get(side.source.matchId);
        if (!feeder) return side.entrantId === null ? side : { ...side, entrantId: null };
        const resolved =
          side.source.from === "winner"
            ? winnerEntrantId(feeder, config.score)
            : loserEntrantId(feeder, config.score);
        return side.entrantId === resolved ? side : { ...side, entrantId: resolved };
      });

      const status = deriveStatus(match, sides);
      const sidesChanged = sides.some((s, i) => s !== match.sides[i]);
      if (!sidesChanged && status === match.status) return match;

      changed = true;
      return { ...match, sides, status };
    });

    matches = next;
    if (!changed) break;
  }

  return matches === state.matches ? state : { ...state, matches };
}

function deriveStatus(match: Match, sides: readonly Side[]): MatchStatus {
  if (match.status === "void") return "void";
  if (match.result !== null) return "complete";

  const filled = sides.filter((s) => s.entrantId !== null);
  // A slot with no occupant and nothing feeding it will never be filled: this
  // fixture is a walkover for whoever is present.
  const permanentlyEmpty = sides.filter((s) => s.entrantId === null && s.source === null);

  if (filled.length === 1 && permanentlyEmpty.length === sides.length - 1) return "bye";
  if (filled.length === sides.length) return "ready";
  return "pending";
}

/** Fold a log into state. The log is sorted first, so callers may pass it in any order. */
export function replay(log: EventLog): TournamentState {
  const ordered = sortLog(log);
  let state = emptyState();
  for (const envelope of ordered) state = applyEvent(state, envelope);
  return propagate(state);
}
