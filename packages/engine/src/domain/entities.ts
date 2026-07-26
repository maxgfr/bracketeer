/**
 * The entities a tournament is made of.
 *
 * These describe *established fact* — who entered, which matches exist, what was
 * reported. Anything derivable (standings, ratings, who has qualified) is
 * computed on demand rather than stored, so there is exactly one source of truth
 * and no possibility of the two drifting apart.
 */

import type { TournamentConfig } from "./config.js";

export type EntrantId = string;
export type MatchId = string;
export type StageId = string;
export type GroupId = string;

export interface Entrant {
  id: EntrantId;
  name: string;
  /** Lower is stronger. null means unseeded. */
  seed: number | null;
  /** Individual names, for team entrants. Empty for individuals. */
  members: string[];
  /** Organiser-defined fields: club, country, category, licence number… */
  meta: Record<string, string>;
  status: "active" | "withdrawn";
  /** Starting rating override. null falls back to the configured initial rating. */
  rating: number | null;
}

/**
 * Which part of a stage a match belongs to. Elimination stages can run several
 * brackets at once — that is what gives a first-round loser somewhere to go.
 */
export type BracketSlot =
  | "main"
  | "lower"
  | "consolation"
  | "grand_final"
  | "third_place";

/** Where the occupant of a slot comes from, before it is known. */
export type SideSource =
  | { from: "winner"; matchId: MatchId }
  | { from: "loser"; matchId: MatchId }
  | { from: "qualifier"; stageId: StageId; rank: number };

export interface Side {
  /** null while the slot is still waiting on an earlier match. */
  entrantId: EntrantId | null;
  source: SideSource | null;
  isHome: boolean;
}

export type MatchStatus =
  /** Waiting on an earlier match to fill a slot. */
  | "pending"
  /** Every side is known and it can be played. */
  | "ready"
  | "complete"
  /** Walked over because there was nobody to play. Counts as a win. */
  | "bye"
  /** Cancelled; excluded from standings and ratings. */
  | "void";

interface ResultBase {
  /** Settled after regulation. Feeds the overtime entries of the points system. */
  overtime?: boolean;
  /** Side indices that failed to appear. */
  forfeitBy?: number[];
  note?: string;
}

/**
 * A reported result, in the shape the configured score kind calls for. The
 * scoring module normalises every variant into a single canonical outcome, so
 * standings and ratings never branch on the sport.
 */
export type MatchResult = ResultBase &
  (
    | { kind: "points"; scores: number[] }
    /** sets[i] holds each side's score in set i. */
    | { kind: "sets"; sets: number[][] }
    /** winner is a side index; null is a draw. */
    | { kind: "outcome"; winner: number | null }
    /** places[0] holds the side indices that finished first, and so on. */
    | { kind: "placement"; places: number[][] }
    /** null for a side that did not finish. */
    | { kind: "time"; times: (number | null)[] }
  );

export interface Match {
  id: MatchId;
  stageId: StageId;
  /** Set when the stage splits into groups. */
  groupId: GroupId | null;
  bracket: BracketSlot;
  /** 0-based within the stage. */
  roundIndex: number;
  /** Position within the round, for stable display order. */
  order: number;
  sides: Side[];
  result: MatchResult | null;
  /** ISO date-time. */
  scheduledAt: string | null;
  venueId: string | null;
  status: MatchStatus;
  /** Organiser-facing label such as "Quarter-final" or "Matchday 3". */
  label: string | null;
}

export interface Group {
  id: GroupId;
  name: string;
  entrantIds: EntrantId[];
}

export interface StageRuntime {
  id: StageId;
  started: boolean;
  /** Entrants that entered this stage, in seeded order. */
  entrantIds: EntrantId[];
  groups: Group[];
  /** How many rounds have been committed to the log so far. */
  roundsGenerated: number;
}

/**
 * The full replayed state of a tournament. Produced only by folding the event
 * log — never constructed or mutated directly.
 */
export interface TournamentState {
  id: string;
  name: string;
  /** ISO date-time the tournament was created. */
  createdAt: string;
  /** Seeds every deterministic draw: random pairings, lots, group allocation. */
  seed: number;
  config: TournamentConfig;
  entrants: Entrant[];
  matches: Match[];
  stages: StageRuntime[];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Small helpers used across the engine
 * ──────────────────────────────────────────────────────────────────────────── */

export function findEntrant(state: TournamentState, id: EntrantId): Entrant | undefined {
  return state.entrants.find((e) => e.id === id);
}

export function findMatch(state: TournamentState, id: MatchId): Match | undefined {
  return state.matches.find((m) => m.id === id);
}

export function activeEntrants(state: TournamentState): Entrant[] {
  return state.entrants.filter((e) => e.status === "active");
}

export function matchesOfStage(state: TournamentState, stageId: StageId): Match[] {
  return state.matches.filter((m) => m.stageId === stageId);
}

/** Matches that carry a usable result — excludes voided and unplayed ones. */
export function playedMatches(matches: readonly Match[]): Match[] {
  return matches.filter(
    (m) => m.status !== "void" && (m.status === "bye" || m.result !== null),
  );
}

export function sideEntrantIds(match: Match): EntrantId[] {
  return match.sides
    .map((s) => s.entrantId)
    .filter((id): id is EntrantId => id !== null);
}
