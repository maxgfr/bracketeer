/**
 * Applying a rating system to a tournament.
 *
 * Ratings are derived, never stored: they are recomputed by walking the matches
 * in order. That keeps them consistent with the log — correct a score entered
 * three rounds ago and every rating downstream of it fixes itself — and means a
 * peer that receives events out of order still ends up with the same numbers.
 */

import type { RatingConfig } from "../domain/config.js";
import type { EntrantId, Match, TournamentState } from "../domain/entities.js";
import { outcomeOfMatch, type NormalizedOutcome } from "../scoring/normalize.js";
import { eloUpdate, type EloPlayer } from "./elo.js";
import { glicko2Update, type Glicko2Player, type Glicko2Result } from "./glicko2.js";
import { conservativeRating, trueSkillUpdate, type TrueSkillPlayer } from "./trueskill.js";

export * from "./elo.js";
export * from "./gaussian.js";
export * from "./glicko2.js";
export * from "./trueskill.js";

export interface RatingEntry {
  entrantId: EntrantId;
  /** The single number shown in tables and used by rating-based pairing. */
  rating: number;
  /** How much the tournament has moved this entrant so far. */
  change: number;
  matchesPlayed: number;
  /** Glicko-2 only: how sure the system is. */
  deviation?: number;
  volatility?: number;
  /** TrueSkill only. */
  mu?: number;
  sigma?: number;
}

export type RatingTable = Map<EntrantId, RatingEntry>;

/** Matches that can move a rating, in the order they were played. */
function ratedMatches(matches: readonly Match[]): Match[] {
  return matches
    .filter((m) => m.status === "complete" && m.result !== null)
    .slice()
    .sort((a, b) => a.roundIndex - b.roundIndex || a.order - b.order);
}

/** 1 for a win, 0.5 for a share of the tier, 0 for a loss. */
function scoreBetween(outcome: NormalizedOutcome, a: number, b: number): number {
  const tierOf = (index: number): number =>
    outcome.places.findIndex((tier) => tier.includes(index));
  const ta = tierOf(a);
  const tb = tierOf(b);
  if (ta < 0 || tb < 0) return 0.5;
  if (ta === tb) return 0.5;
  return ta < tb ? 1 : 0;
}

function startingRating(state: TournamentState, entrantId: EntrantId, config: RatingConfig): number {
  const entrant = state.entrants.find((e) => e.id === entrantId);
  return entrant?.rating ?? config.initial;
}

function computeElo(state: TournamentState, matches: readonly Match[]): RatingTable {
  const config = state.config.rating;
  const players = new Map<EntrantId, EloPlayer>();
  const initial = new Map<EntrantId, number>();

  for (const entrant of state.entrants) {
    const rating = startingRating(state, entrant.id, config);
    players.set(entrant.id, { rating, matchesPlayed: 0 });
    initial.set(entrant.id, rating);
  }

  for (const match of ratedMatches(matches)) {
    const outcome = outcomeOfMatch(match, state.config.score);
    if (!outcome) continue;

    const sides = match.sides.map((s) => s.entrantId);
    const present = sides.filter((id): id is EntrantId => id !== null);
    if (present.length < 2) continue;

    // Every pair in the fixture is a comparison. A free-for-all therefore splits
    // one result across the pairings it implies, weighted so a twelve-way race
    // does not move ratings eleven times as much as a duel.
    const weight = 1 / (present.length - 1);
    const updated = new Map<EntrantId, number>();

    for (let i = 0; i < sides.length; i += 1) {
      const a = sides[i];
      if (!a) continue;
      const playerA = players.get(a);
      if (!playerA) continue;

      let rating = playerA.rating;
      for (let j = 0; j < sides.length; j += 1) {
        if (i === j) continue;
        const b = sides[j];
        if (!b) continue;
        const playerB = players.get(b);
        if (!playerB) continue;

        const score = scoreBetween(outcome, i, j);
        const margin =
          outcome.pointsFor !== null
            ? (outcome.pointsFor[i] ?? 0) - (outcome.pointsFor[j] ?? 0)
            : undefined;

        // Each comparison is measured against the ratings held *before* the
        // fixture, so the order sides happen to be listed in cannot matter.
        const next = eloUpdate(playerA, playerB, score, config, { margin, weight });
        rating += next - playerA.rating;
      }
      updated.set(a, rating);
    }

    for (const [entrantId, rating] of updated) {
      const player = players.get(entrantId);
      if (player) players.set(entrantId, { rating, matchesPlayed: player.matchesPlayed + 1 });
    }
  }

  const table: RatingTable = new Map();
  for (const [entrantId, player] of players) {
    table.set(entrantId, {
      entrantId,
      rating: player.rating,
      change: player.rating - (initial.get(entrantId) ?? player.rating),
      matchesPlayed: player.matchesPlayed,
    });
  }
  return table;
}

function computeGlicko2(state: TournamentState, matches: readonly Match[]): RatingTable {
  const config = state.config.rating;
  const players = new Map<EntrantId, Glicko2Player>();
  const initial = new Map<EntrantId, number>();
  const played = new Map<EntrantId, number>();

  for (const entrant of state.entrants) {
    const rating = startingRating(state, entrant.id, config);
    players.set(entrant.id, {
      rating,
      deviation: config.glicko2.initialRd,
      volatility: config.glicko2.initialVolatility,
    });
    initial.set(entrant.id, rating);
    played.set(entrant.id, 0);
  }

  // Glicko-2 updates per rating period rather than per match, so a round is
  // evaluated against the ratings everybody held when it started.
  const rounds = new Map<number, Match[]>();
  for (const match of ratedMatches(matches)) {
    const bucket = rounds.get(match.roundIndex) ?? [];
    bucket.push(match);
    rounds.set(match.roundIndex, bucket);
  }

  for (const roundIndex of [...rounds.keys()].sort((a, b) => a - b)) {
    const roundMatches = rounds.get(roundIndex) ?? [];
    const results = new Map<EntrantId, Glicko2Result[]>();

    for (const match of roundMatches) {
      const outcome = outcomeOfMatch(match, state.config.score);
      if (!outcome) continue;
      const sides = match.sides.map((s) => s.entrantId);

      for (let i = 0; i < sides.length; i += 1) {
        const a = sides[i];
        if (!a) continue;
        for (let j = 0; j < sides.length; j += 1) {
          if (i === j) continue;
          const b = sides[j];
          if (!b) continue;
          const opponent = players.get(b);
          if (!opponent) continue;

          const list = results.get(a) ?? [];
          list.push({ opponent, score: scoreBetween(outcome, i, j) });
          results.set(a, list);
        }
      }
    }

    for (const [entrantId, playerResults] of results) {
      const player = players.get(entrantId);
      if (!player) continue;
      players.set(entrantId, glicko2Update(player, playerResults, config.glicko2.tau));
      played.set(entrantId, (played.get(entrantId) ?? 0) + playerResults.length);
    }
  }

  const table: RatingTable = new Map();
  for (const [entrantId, player] of players) {
    table.set(entrantId, {
      entrantId,
      rating: player.rating,
      change: player.rating - (initial.get(entrantId) ?? player.rating),
      matchesPlayed: played.get(entrantId) ?? 0,
      deviation: player.deviation,
      volatility: player.volatility,
    });
  }
  return table;
}

function computeTrueSkill(state: TournamentState, matches: readonly Match[]): RatingTable {
  const config = state.config.rating;
  const players = new Map<EntrantId, TrueSkillPlayer>();
  const initial = new Map<EntrantId, number>();
  const played = new Map<EntrantId, number>();

  for (const entrant of state.entrants) {
    const player = { mu: config.trueskill.mu, sigma: config.trueskill.sigma };
    players.set(entrant.id, player);
    initial.set(entrant.id, conservativeRating(player));
    played.set(entrant.id, 0);
  }

  const settings = {
    beta: config.trueskill.beta,
    tau: config.trueskill.tau,
    drawProbability: config.trueskill.drawProbability,
  };

  for (const match of ratedMatches(matches)) {
    const outcome = outcomeOfMatch(match, state.config.score);
    if (!outcome) continue;

    // Finishing order, best first, flattened across tied tiers.
    const ordered = outcome.places.flatMap((tier) =>
      tier.map((index) => ({ index, tier: outcome.places.findIndex((t) => t.includes(index)) })),
    );

    for (let i = 0; i + 1 < ordered.length; i += 1) {
      const above = ordered[i];
      const below = ordered[i + 1];
      if (!above || !below) continue;

      const a = match.sides[above.index]?.entrantId;
      const b = match.sides[below.index]?.entrantId;
      if (!a || !b) continue;

      const playerA = players.get(a);
      const playerB = players.get(b);
      if (!playerA || !playerB) continue;

      const updated = trueSkillUpdate(playerA, playerB, settings, above.tier === below.tier);
      players.set(a, updated.winner);
      players.set(b, updated.loser);
    }

    for (const side of match.sides) {
      if (side.entrantId) played.set(side.entrantId, (played.get(side.entrantId) ?? 0) + 1);
    }
  }

  const table: RatingTable = new Map();
  for (const [entrantId, player] of players) {
    const rating = conservativeRating(player);
    table.set(entrantId, {
      entrantId,
      rating,
      change: rating - (initial.get(entrantId) ?? rating),
      matchesPlayed: played.get(entrantId) ?? 0,
      mu: player.mu,
      sigma: player.sigma,
    });
  }
  return table;
}

/**
 * Current ratings for every entrant.
 *
 * Returns an empty table when ratings are switched off, so callers never need
 * to branch on whether the tournament uses them.
 */
export function computeRatings(
  state: TournamentState,
  matches: readonly Match[] = state.matches,
): RatingTable {
  switch (state.config.rating.system) {
    case "none":
      return new Map();
    case "elo":
      return computeElo(state, matches);
    case "glicko2":
      return computeGlicko2(state, matches);
    case "trueskill":
      return computeTrueSkill(state, matches);
  }
}

/** Just the numbers, for pairing and tiebreakers. */
export function ratingValues(table: RatingTable): Map<EntrantId, number> {
  const values = new Map<EntrantId, number>();
  for (const [entrantId, entry] of table) values.set(entrantId, entry.rating);
  return values;
}
