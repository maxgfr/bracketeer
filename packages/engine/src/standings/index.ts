/**
 * Standings: records plus tiebreakers, assembled into a table.
 */

import type { StandingsConfig } from "../domain/config.js";
import type { EntrantId, Match, StageId, TournamentState } from "../domain/entities.js";
import { matchesOfStage } from "../domain/entities.js";
import { startingScores } from "./initial.js";
import { computeRecords, type EntrantRecord } from "./records.js";
import { metricsFor, rankEntrants, type TiebreakContext } from "./tiebreakers.js";

export * from "./initial.js";
export * from "./records.js";
export * from "./tiebreakers.js";

export interface StandingRow {
  /** Shared by entrants the tiebreakers could not separate. */
  rank: number;
  entrantId: EntrantId;
  record: EntrantRecord;
  /** Every configured tiebreaker's value, for display. */
  metrics: Record<string, number>;
  /** True when the entrant below shares this rank. */
  tiedWithNext: boolean;
}

export interface StandingsOptions {
  /** Current ratings, when a rating system is enabled. */
  ratings?: Map<EntrantId, number>;
  /** Override the tournament-level standings configuration. */
  standings?: StandingsConfig;
}

/** Build a table from an explicit set of matches and entrants. */
export function computeStandings(
  state: TournamentState,
  matches: readonly Match[],
  entrantIds: readonly EntrantId[],
  options: StandingsOptions = {},
): StandingRow[] {
  const standings = options.standings ?? state.config.standings;
  const ratings = options.ratings ?? new Map<EntrantId, number>();
  const records = computeRecords(
    matches,
    state.config.score,
    standings,
    entrantIds,
    startingScores(entrantIds, ratings, standings),
  );

  const context: TiebreakContext = { records, ratings, seed: state.seed };

  const tiers = rankEntrants(entrantIds, standings.tiebreakers, context);

  const rows: StandingRow[] = [];
  let rank = 1;
  for (const tier of tiers) {
    for (const entrantId of tier) {
      // computeRecords seeds a record for every id it was given, so this is
      // only ever missing for an id that is not in the table at all.
      const record = records.get(entrantId);
      if (!record) continue;
      rows.push({
        rank,
        entrantId,
        record,
        metrics: metricsFor(entrantId, standings.tiebreakers, tier, context),
        tiedWithNext: tier.length > 1,
      });
    }
    rank += tier.length;
  }

  // The last member of a tied tier has nobody below sharing its rank.
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const next = rows[i + 1];
    if (row) row.tiedWithNext = next !== undefined && next.rank === row.rank;
  }

  return rows;
}

/** The table for one stage. */
export function stageStandings(
  state: TournamentState,
  stageId: StageId,
  options: StandingsOptions = {},
): StandingRow[] {
  const stage = state.stages.find((s) => s.id === stageId);
  const stageConfig = state.config.stages.find((s) => s.id === stageId);
  const entrantIds = stage?.entrantIds ?? state.entrants.map((e) => e.id);

  return computeStandings(state, matchesOfStage(state, stageId), entrantIds, {
    ...options,
    standings: options.standings ?? stageConfig?.standings ?? state.config.standings,
  });
}

/** The table for one group inside a stage. */
export function groupStandings(
  state: TournamentState,
  stageId: StageId,
  groupId: string,
  options: StandingsOptions = {},
): StandingRow[] {
  const stage = state.stages.find((s) => s.id === stageId);
  const group = stage?.groups.find((g) => g.id === groupId);
  if (!group) return [];

  const matches = matchesOfStage(state, stageId).filter((m) => m.groupId === groupId);
  const stageConfig = state.config.stages.find((s) => s.id === stageId);

  return computeStandings(state, matches, group.entrantIds, {
    ...options,
    standings: options.standings ?? stageConfig?.standings ?? state.config.standings,
  });
}

/** The overall table across every stage played so far. */
export function overallStandings(
  state: TournamentState,
  options: StandingsOptions = {},
): StandingRow[] {
  return computeStandings(
    state,
    state.matches,
    state.entrants.map((e) => e.id),
    options,
  );
}
