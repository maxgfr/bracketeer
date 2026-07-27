/**
 * The structure of a shape, read from the engine rather than drawn by hand.
 *
 * A hand-drawn diagram is a second description of the rules, and second
 * descriptions drift — one shipped example once promised a consolation bracket
 * its configuration could not produce, and said so for months. So a sample
 * tournament is actually built and played, and the picture is traced from what
 * came out. If the structure changes, the diagram changes with it or the tests
 * fail.
 */

import {
  addEntrant,
  advanceStage,
  createTournament,
  isStageComplete,
  nextStageToStart,
  startStage,
} from "../commands/index.js";
import { parseConfig, type TournamentConfigInput } from "../domain/config.js";
import type { BracketSlot, Match, TournamentState } from "../domain/entities.js";
import { nominalResult } from "../scoring/normalize.js";
import { replay } from "../events/reducer.js";
import { appendEvent, type DomainEvent, type EventLog } from "../events/types.js";

export interface BracketShape {
  slot: BracketSlot;
  /** Fixtures in each round, in order. */
  rounds: number[];
  /** True when later rounds are fed by earlier ones, so it can be drawn as a tree. */
  isTree: boolean;
}

export interface StageShape {
  id: string;
  name: string;
  kind: string;
  /** How many groups the stage splits into. Zero when it does not. */
  groupCount: number;
  /** The structure of one group, when there are groups; of the stage otherwise. */
  brackets: BracketShape[];
  /** Entrants that enter this stage. */
  entrants: number;
  /** How many come through to the next one. Null when it is the last. */
  qualifiers: number | null;
  sidesPerMatch: number;
}

export interface Shape {
  stages: StageShape[];
  /** The field the sample was built with. */
  entrants: number;
}

/**
 * Build and play a sample tournament, so the structure is the real one.
 *
 * Sixteen entrants: enough for four groups of four and a power of two for any
 * bracket, small enough that the whole thing folds in a millisecond.
 */
function playSample(config: TournamentConfigInput, entrants: number): TournamentState {
  // Both constants are literals rather than derived from a clock: nothing in the
  // engine may read the time, because two devices replaying one log have to
  // reach identical state. `architecture.test.ts` enforces it.
  const at = 1_700_000_000_000;
  let log: EventLog = appendEvent(
    [],
    "d",
    createTournament({ name: "sample", config, seed: 7, createdAt: "2023-11-14T22:13:20.000Z" }),
    at,
  );

  for (let i = 0; i < entrants; i += 1) {
    log = appendEvent(log, "d", addEntrant({ id: `e${i}`, name: `${i + 1}`, seed: i + 1 }), at + i);
  }

  const apply = (events: readonly DomainEvent[]) => {
    for (const event of events) log = appendEvent(log, "d", event, at + log.length + 100);
  };

  for (let guard = 0; guard < 500; guard += 1) {
    let state = replay(log);

    const next = nextStageToStart(state);
    if (next) {
      apply(startStage(state, next));
      continue;
    }

    state = replay(log);
    const ready = state.matches.filter((m) => m.status === "ready");
    if (ready.length > 0) {
      for (const match of ready) {
        apply([{ type: "result_reported", matchId: match.id, result: nominalResult(state.config.score, match.sides.length) }]);
      }
      continue;
    }

    let advanced = false;
    for (const stage of state.stages) {
      const events = advanceStage(state, stage.id);
      if (events.length > 0) {
        apply(events);
        advanced = true;
        break;
      }
    }
    if (!advanced) break;
  }

  return replay(log);
}

const SLOT_ORDER: BracketSlot[] = ["main", "lower", "consolation", "grand_final", "third_place"];

function bracketsOf(matches: readonly Match[]): BracketShape[] {
  const out: BracketShape[] = [];

  for (const slot of SLOT_ORDER) {
    const inSlot = matches.filter((m) => m.bracket === slot);
    if (inSlot.length === 0) continue;

    const roundIndexes = [...new Set(inSlot.map((m) => m.roundIndex))].sort((a, b) => a - b);
    const rounds = roundIndexes.map(
      (r) => inSlot.filter((m) => m.roundIndex === r && m.status !== "void").length,
    );

    // A tree is a structure whose later fixtures are fed by earlier ones. That
    // is what distinguishes a knockout from a set of rounds drawn afresh.
    const isTree = inSlot.some((m) =>
      m.sides.some((s) => s.source?.from === "winner" || s.source?.from === "loser"),
    );

    out.push({ slot, rounds: rounds.filter((n) => n > 0), isTree });
  }

  return out;
}

export function readShape(config: TournamentConfigInput, entrants = 16): Shape {
  const parsed = parseConfig(config);
  const state = playSample(config, entrants);

  const stages: StageShape[] = state.stages.map((runtime, index) => {
    const stageConfig = parsed.stages.find((s) => s.id === runtime.id);
    const matches = state.matches.filter((m) => m.stageId === runtime.id);

    const groupCount = runtime.groups.length;
    // With groups, every group has the same structure, so draw one of them.
    const sample =
      groupCount > 0 ? matches.filter((m) => m.groupId === runtime.groups[0]?.id) : matches;

    const nextStage = state.stages[index + 1];

    return {
      id: runtime.id,
      name: stageConfig?.name || runtime.id,
      kind: stageConfig?.kind ?? "unknown",
      groupCount,
      brackets: bracketsOf(sample),
      entrants: runtime.entrantIds.length,
      qualifiers: nextStage ? nextStage.entrantIds.length : null,
      sidesPerMatch: parsed.match.sidesPerMatch,
    };
  });

  // A ladder has no fixtures until somebody challenges, so it never appears
  // above. It still has a shape worth drawing.
  if (stages.length === 0 && parsed.stages[0]) {
    const only = parsed.stages[0];
    stages.push({
      id: only.id,
      name: only.name || only.id,
      kind: only.kind,
      groupCount: 0,
      brackets: [],
      entrants,
      qualifiers: null,
      sidesPerMatch: parsed.match.sidesPerMatch,
    });
  }

  return { stages, entrants };
}

/** Whether every stage finished, which the tests use to be sure the sample is real. */
export function sampleCompletes(config: TournamentConfigInput, entrants = 16): boolean {
  const parsed = parseConfig(config);
  if (parsed.stages.every((s) => s.kind === "ladder")) return true;
  const state = playSample(config, entrants);
  return parsed.stages.every((s) => isStageComplete(state, s.id));
}
