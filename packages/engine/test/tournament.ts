/**
 * A tiny driver that runs a whole tournament the way the application does:
 * append commands to a log, replay, act on the new state.
 */

import {
  addEntrant,
  advanceStage,
  createTournament,
  isStageComplete,
  nextStageToStart,
  startStage,
} from "../src/commands/index.js";
import type { TournamentConfigInput } from "../src/domain/config.js";
import type { Match, MatchResult, TournamentState } from "../src/domain/entities.js";
import { replay } from "../src/events/reducer.js";
import { appendEvent, type DomainEvent, type EventEnvelope } from "../src/events/types.js";

export class Driver {
  log: EventEnvelope[] = [];
  private clock = 1_000;

  constructor(config: TournamentConfigInput, entrantNames: readonly string[], seed = 7) {
    this.apply([
      createTournament({
        name: "Test",
        config,
        seed,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      ...entrantNames.map((name) => addEntrant({ id: name, name })),
    ]);
  }

  get state(): TournamentState {
    return replay(this.log);
  }

  apply(events: readonly DomainEvent[]): void {
    for (const event of events) {
      this.clock += 1;
      this.log = appendEvent(this.log, "test", event, this.clock);
    }
  }

  start(stageId: string): void {
    this.apply(startStage(this.state, stageId));
  }

  advance(stageId: string): boolean {
    const events = advanceStage(this.state, stageId);
    this.apply(events);
    return events.length > 0;
  }

  /** Every fixture that can be played right now. */
  playable(): Match[] {
    return this.state.matches.filter((m) => m.status === "ready");
  }

  report(matchId: string, result: MatchResult): void {
    this.apply([{ type: "result_reported", matchId, result }]);
  }

  /**
   * Play out a whole stage, deciding each fixture with the supplied rule.
   * `decide` receives the two entrant ids and returns their scores.
   */
  playStage(
    stageId: string,
    decide: (a: string, b: string) => [number, number],
    limit = 500,
  ): void {
    for (let i = 0; i < limit; i += 1) {
      const ready = this.playable().filter((m) => m.stageId === stageId);

      if (ready.length === 0) {
        if (!this.advance(stageId)) break;
        continue;
      }

      for (const match of ready) {
        const [a, b] = match.sides.map((s) => s.entrantId);
        if (!a || !b) continue;
        this.report(match.id, { kind: "points", scores: decide(a, b) });
      }
    }
  }

  /** Play every stage to the end, starting any that have not been opened yet. */
  runAll(decide: (a: string, b: string) => [number, number]): void {
    for (const stage of this.state.config.stages) {
      const runtime = this.state.stages.find((s) => s.id === stage.id);
      if (!runtime?.started) {
        if (nextStageToStart(this.state) !== stage.id) break;
        this.start(stage.id);
      }
      this.playStage(stage.id, decide);
      if (!isStageComplete(this.state, stage.id)) break;
    }
  }

  matchesOf(stageId: string, bracket?: string): Match[] {
    return this.state.matches.filter(
      (m) => m.stageId === stageId && (bracket === undefined || m.bracket === bracket),
    );
  }
}

/**
 * A deterministic result rule: whoever comes first alphabetically wins. Gives
 * every test a predictable, fully-ordered outcome without any randomness.
 */
export const strongerWins = (a: string, b: string): [number, number] =>
  a < b ? [13, 7] : [7, 13];

/** Rank order by name, so `p01` is the strongest. */
export const bySeed = (a: string, b: string): [number, number] => (a < b ? [13, 5] : [5, 13]);

export const names = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `p${String(i + 1).padStart(2, "0")}`);
