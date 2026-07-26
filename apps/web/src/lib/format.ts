/**
 * Turning engine values into the words and figures the sheet prints.
 */

import type { Match, MatchResult, ScoreConfig, TournamentState } from "@bracketeer/engine";
import { outcomeOfMatch } from "@bracketeer/engine";

export function entrantName(state: TournamentState, id: string | null): string {
  if (!id) return "—";
  return state.entrants.find((e) => e.id === id)?.name ?? "—";
}

/** The scoreline as it would be written on a results sheet. */
export function scoreline(result: MatchResult | null, score: ScoreConfig): string {
  if (!result) return "";

  switch (result.kind) {
    case "points":
      return result.scores.join("–");
    case "sets":
      return result.sets.map((set) => set.join("–")).join("  ");
    case "outcome":
      return result.winner === null ? "draw" : "";
    case "placement":
      return result.places.map((tier) => tier.map((i) => i + 1).join("=")).join(" ");
    case "time":
      return result.times.map((t) => (t === null ? "DNF" : String(t))).join("  ");
    default:
      return score.kind;
  }
}

/** Which side won, for emphasising the winner's name. */
export function winningSideIndex(match: Match, score: ScoreConfig): number | null {
  return outcomeOfMatch(match, score)?.winner ?? null;
}

const dateTime = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const timeOnly = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : dateTime.format(date);
}

export function formatTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : timeOnly.format(date);
}

export function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" }).format(date);
}

/** A signed figure, so a point difference reads as a gain or a loss at a glance. */
export function signed(value: number, digits = 0): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

export function round(value: number, digits = 0): string {
  return String(Number(value.toFixed(digits)));
}

export const TIEBREAKER_LABELS: Record<string, string> = {
  points: "PTS",
  wins: "W",
  head_to_head: "H2H",
  buchholz: "BUCH",
  median_buchholz: "MBUC",
  sonneborn_berger: "SB",
  point_diff: "±",
  points_for: "PF",
  points_against: "PA",
  opponent_avg_rating: "OPP",
  rating: "RTG",
  matches_played: "PL",
  drawn_lot: "LOT",
};

export const TIEBREAKER_TITLES: Record<string, string> = {
  points: "Competition points",
  wins: "Wins",
  head_to_head: "Results between the tied entrants",
  buchholz: "Buchholz — the strength of the opponents you faced",
  median_buchholz: "Median Buchholz — Buchholz with the best and worst opponent dropped",
  sonneborn_berger: "Sonneborn-Berger — the strength of the opponents you beat",
  point_diff: "Point difference",
  points_for: "Points scored",
  points_against: "Points conceded",
  opponent_avg_rating: "Average opponent rating",
  rating: "Rating",
  matches_played: "Matches played",
  drawn_lot: "Drawn lot",
};

export const STAGE_LABELS: Record<string, string> = {
  single_elimination: "Single elimination",
  double_elimination: "Double elimination",
  round_robin: "Round robin",
  swiss: "Swiss",
  groups: "Groups",
  ladder: "Ladder",
  stepladder: "Stepladder",
  page_playoff: "Page playoff",
};

export const BRACKET_LABELS: Record<string, string> = {
  main: "Main draw",
  lower: "Lower bracket",
  consolation: "Consolation",
  grand_final: "Grand final",
  third_place: "Third place",
};
