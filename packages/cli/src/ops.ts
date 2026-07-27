/**
 * The operations, once.
 *
 * There are two front ends — a CLI and an MCP server — and they must not be two
 * implementations. Everything either of them can do is a function here, taking a
 * log and returning a log plus a plain result object. The front ends only parse
 * arguments and render output.
 *
 * Every function follows the engine's contract: commands produce events, events
 * are appended, and state falls out of `replay`. Nothing here constructs a
 * `TournamentState` by hand, because a state that was not folded from a log
 * cannot be merged, undone, shared, or reproduced.
 */

import {
  addEntrant,
  advanceStage,
  appendEvent,
  computeRatings,
  createTournament,
  findEntrant,
  findMatch,
  isStageComplete,
  logFor,
  nextStageToStart,
  outcomeOfMatch,
  overallStandings,
  parseConfig,
  planSchedule,
  findConflicts,
  groupStandings,
  ratingValues,
  replay,
  scheduleEvents,
  stageStandings,
  startStage,
  toIcs,
  undoLast,
  urlSizeVerdict,
  type Audience,
  type DomainEvent,
  type EventLog,
  type Match,
  type MatchResult,
  type ScoreConfig,
  type StandingRow,
  type TournamentConfigInput,
  type TournamentState,
} from "@bracketeer/engine";
import { EXAMPLES, findExample, findFormat, SPORTS } from "@bracketeer/presets";
import { encode, siteOrigin } from "./codec.js";

export interface Outcome<T> {
  log: EventLog;
  result: T;
}

/**
 * A wall-clock stamp for the envelope.
 *
 * The engine never reads the clock — replaying a log has to give the same answer
 * on every device. Envelopes carry a time for humans, and ordering uses the
 * Lamport counter instead, so taking `Date.now()` out here is safe.
 */
function now(): number {
  return Date.now();
}

function apply(log: EventLog, actor: string, events: readonly DomainEvent[]): EventLog {
  let out = log;
  for (const event of events) out = appendEvent(out, actor, event, now());
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Starting points
 * ──────────────────────────────────────────────────────────────────────────── */

export interface ShapeSummary {
  id: string;
  name: string;
  category: string;
  signature: string;
  summary: string;
  matchesEach: string;
}

export function listShapes(): ShapeSummary[] {
  return EXAMPLES.map((e) => ({
    id: e.id,
    name: e.name,
    category: e.category,
    signature: e.signature,
    summary: e.summary,
    matchesEach: e.games,
  }));
}

export interface SportSummary {
  id: string;
  name: string;
  note: string;
  formats: { id: string; name: string; basedOn: string; fills: string }[];
}

export function listSports(): SportSummary[] {
  return SPORTS.map((s) => ({
    id: s.id,
    name: s.name,
    note: s.note,
    formats: s.formats.map((f) => ({
      id: f.id,
      name: f.name,
      basedOn: f.basedOn,
      fills: f.fills,
    })),
  }));
}

/**
 * The configuration a starting point stands for.
 *
 * A sport format is a shape with the scoring filled in, so both resolve to the
 * same kind of thing: a plain config object the engine would accept from anyone.
 */
export function resolveStart(input: {
  shape?: string;
  sport?: string;
  config?: TournamentConfigInput;
}): { name: string; config: TournamentConfigInput } {
  if (input.config) return { name: "Tournament", config: input.config };

  if (input.sport) {
    const format = findFormat(input.sport);
    if (format) {
      const sport = SPORTS.find((s) => s.formats.some((f) => f.id === input.sport));
      return { name: `${sport?.name ?? "Tournament"} — ${format.name}`, config: format.config };
    }
    // A bare sport id: take its first format, which is the common arrangement.
    const sport = SPORTS.find((s) => s.id === input.sport);
    const first = sport?.formats[0];
    if (sport && first) return { name: `${sport.name} — ${first.name}`, config: first.config };

    throw new Error(
      `No sport or format called "${input.sport}". Run \`bracketeer sports\` to see them.`,
    );
  }

  const shape = findExample(input.shape ?? "knockout");
  if (!shape) {
    throw new Error(`No shape called "${input.shape}". Run \`bracketeer shapes\` to see them.`);
  }
  return { name: shape.name, config: shape.config };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Setup
 * ──────────────────────────────────────────────────────────────────────────── */

export function create(input: {
  name?: string;
  shape?: string;
  sport?: string;
  config?: TournamentConfigInput;
  entrants?: readonly string[];
  seed: number;
  actor: string;
}): Outcome<{ name: string; entrants: number; stages: string[] }> {
  const start = resolveStart(input);
  // Fail here rather than three commands later, where the cause is not obvious.
  const parsed = parseConfig(start.config);

  let log: EventLog = apply([], input.actor, [
    createTournament({
      name: input.name?.trim() || start.name,
      config: start.config,
      seed: input.seed,
      createdAt: new Date(now()).toISOString(),
    }),
  ]);

  log = addEntrants(log, { names: input.entrants ?? [], actor: input.actor }).log;

  const state = replay(log);
  return {
    log,
    result: {
      name: state.name,
      entrants: state.entrants.length,
      stages: parsed.stages.map((s) => s.id),
    },
  };
}

/** Names in order; the order becomes the seeding, as it does in the app. */
export function addEntrants(
  log: EventLog,
  input: { names: readonly string[]; actor: string },
): Outcome<{ added: string[] }> {
  const existing = replay(log).entrants.length;
  const clean = input.names.map((n) => n.trim()).filter(Boolean);

  const events = clean.map((name, i) =>
    addEntrant({ id: entrantIdFor(name, log, i), name, seed: existing + i + 1 }),
  );

  return { log: apply(log, input.actor, events), result: { added: clean } };
}

/**
 * A readable id derived from the name, since a person typing into a chat will
 * refer to "marie", not to a random string. Collisions get a numeric suffix.
 */
function entrantIdFor(name: string, log: EventLog, offset: number): string {
  const base =
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || `e${offset}`;

  const taken = new Set(replay(log).entrants.map((e) => e.id));
  if (!taken.has(base)) return base;

  for (let i = 2; ; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface EntrantView {
  id: string;
  name: string;
  seed: number | null;
  status: string;
  rating: number | null;
  meta: Record<string, string>;
}

export function listEntrants(log: EventLog): EntrantView[] {
  return replay(log).entrants.map((e) => ({
    id: e.id,
    name: e.name,
    seed: e.seed,
    status: e.status,
    rating: e.rating,
    meta: e.meta,
  }));
}

/** Resolve by id first, then by name, so a conversation can say "Marie". */
export function resolveEntrant(state: TournamentState, reference: string): string {
  const byId = findEntrant(state, reference);
  if (byId) return byId.id;

  const lower = reference.toLowerCase();
  const matches = state.entrants.filter((e) => e.name.toLowerCase() === lower);
  if (matches.length === 1) return matches[0]!.id;
  if (matches.length > 1) {
    throw new Error(`More than one entrant is called "${reference}". Use the id instead.`);
  }

  throw new Error(`No entrant "${reference}".`);
}

export function updateEntrant(
  log: EventLog,
  input: {
    entrant: string;
    name?: string;
    seed?: number | null;
    meta?: Record<string, string>;
    actor: string;
  },
): Outcome<{ id: string }> {
  const id = resolveEntrant(replay(log), input.entrant);
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.seed !== undefined) patch.seed = input.seed;
  if (input.meta !== undefined) patch.meta = input.meta;

  return {
    log: apply(log, input.actor, [{ type: "entrant_updated", id, patch } as DomainEvent]),
    result: { id },
  };
}

export function setEntrantStatus(
  log: EventLog,
  input: { entrant: string; status: "active" | "withdrawn"; actor: string },
): Outcome<{ id: string; status: string }> {
  const id = resolveEntrant(replay(log), input.entrant);
  return {
    log: apply(log, input.actor, [{ type: "entrant_status_changed", id, status: input.status }]),
    result: { id, status: input.status },
  };
}

export function removeEntrant(
  log: EventLog,
  input: { entrant: string; actor: string },
): Outcome<{ id: string }> {
  const id = resolveEntrant(replay(log), input.entrant);
  return {
    log: apply(log, input.actor, [{ type: "entrant_removed", id }]),
    result: { id },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Running it
 * ──────────────────────────────────────────────────────────────────────────── */

/** The stage the tournament is actually in, which is what a caller means. */
export function currentStageId(state: TournamentState): string | null {
  const running = state.stages.find(
    (s) => s.started && !isStageComplete(state, s.id),
  );
  if (running) return running.id;

  const started = state.stages.filter((s) => s.started);
  return started[started.length - 1]?.id ?? null;
}

export interface StatusReport {
  name: string;
  stages: {
    id: string;
    kind: string;
    started: boolean;
    complete: boolean;
    entrants: number;
    groups: number;
  }[];
  entrants: number;
  ready: number;
  played: number;
  total: number;
  /** What to do next, in the same spirit as the app's one-button control strip. */
  next: string;
}

export function status(log: EventLog): StatusReport {
  const state = replay(log);
  const ready = state.matches.filter((m) => m.status === "ready");
  const played = state.matches.filter((m) => m.status === "complete" || m.status === "bye");
  const toStart = nextStageToStart(state);
  const current = currentStageId(state);

  let next: string;
  if (state.entrants.length === 0) next = "Add entrants.";
  else if (toStart) next = `Start the stage "${toStart}".`;
  else if (ready.length > 0) next = `Report ${ready.length} result${ready.length === 1 ? "" : "s"}.`;
  else if (current && !isStageComplete(state, current)) next = `Advance "${current}".`;
  else next = "Finished.";

  return {
    name: state.name,
    stages: state.config.stages.map((s) => {
      const runtime = state.stages.find((r) => r.id === s.id);
      return {
        id: s.id,
        kind: s.kind,
        started: runtime?.started ?? false,
        complete: runtime ? isStageComplete(state, s.id) : false,
        entrants: runtime?.entrantIds.length ?? 0,
        groups: runtime?.groups.length ?? 0,
      };
    }),
    entrants: state.entrants.length,
    ready: ready.length,
    played: played.length,
    total: state.matches.length,
    next,
  };
}

export function start(
  log: EventLog,
  input: { stage?: string; actor: string },
): Outcome<{ stage: string; matches: number }> {
  const state = replay(log);
  const stage = input.stage ?? nextStageToStart(state);
  if (!stage) throw new Error("Every stage has already started.");

  const events = startStage(state, stage);
  if (events.length === 0) throw new Error(`"${stage}" could not be started.`);

  const after = apply(log, input.actor, events);
  const matches = replay(after).matches.filter((m) => m.stageId === stage).length;
  return { log: after, result: { stage, matches } };
}

/**
 * Move a stage on: pair the next round, or open the next stage.
 *
 * `advanceStage` returning nothing is how the engine says "waiting on results",
 * which is a normal state rather than an error — so this reports it as one.
 */
export function advance(
  log: EventLog,
  input: { stage?: string; actor: string },
): Outcome<{ stage: string; moved: boolean; note: string }> {
  const state = replay(log);
  const stage = input.stage ?? currentStageId(state);
  if (!stage) throw new Error("Nothing has started yet.");

  const events = advanceStage(state, stage);
  if (events.length === 0) {
    const outstanding = state.matches.filter(
      (m) => m.stageId === stage && m.status === "ready",
    ).length;
    return {
      log,
      result: {
        stage,
        moved: false,
        note: outstanding > 0 ? `Waiting on ${outstanding} result(s).` : `"${stage}" is finished.`,
      },
    };
  }

  const after = apply(log, input.actor, events);
  return { log: after, result: { stage, moved: true, note: `"${stage}" moved on.` } };
}

export interface MatchView {
  id: string;
  stage: string;
  group: string | null;
  bracket: string;
  round: number;
  status: string;
  sides: { entrant: string | null; id: string | null }[];
  score: string | null;
  scheduledAt: string | null;
}

export function listMatches(
  log: EventLog,
  input: { stage?: string; only?: "ready" | "complete" | "all" } = {},
): MatchView[] {
  const state = replay(log);
  const only = input.only ?? "all";

  return state.matches
    .filter((m) => (input.stage ? m.stageId === input.stage : true))
    .filter((m) => (only === "all" ? true : m.status === only))
    .map((m) => viewOf(state, m));
}

function viewOf(state: TournamentState, match: Match): MatchView {
  return {
    id: match.id,
    stage: match.stageId,
    group: match.groupId,
    bracket: match.bracket,
    round: match.roundIndex + 1,
    status: match.status,
    sides: match.sides.map((s) => ({
      entrant: s.entrantId ? (findEntrant(state, s.entrantId)?.name ?? s.entrantId) : null,
      id: s.entrantId,
    })),
    score: scorelineOf(state, match),
    scheduledAt: match.scheduledAt,
  };
}

function scorelineOf(state: TournamentState, match: Match): string | null {
  const outcome = outcomeOfMatch(match, state.config.score);
  if (!outcome) return null;
  const values = outcome.rawFor ?? outcome.pointsFor;
  if (!values) return outcome.winner === null ? "drawn" : `side ${outcome.winner + 1}`;
  return values.join("–");
}

/**
 * Find the fixture a caller means.
 *
 * A match id is exact. A pair of entrant references is what somebody actually
 * says out loud, and among fixtures that can be played right now it is
 * unambiguous, so both are accepted.
 */
export function resolveMatch(state: TournamentState, reference: string): Match {
  const exact = findMatch(state, reference);
  if (exact) return exact;

  const parts = reference.split(/\s+(?:v|vs|versus|-)\s+/i).map((p) => p.trim());
  if (parts.length === 2) {
    const wanted = parts.map((p) => resolveEntrant(state, p));
    const candidates = state.matches.filter(
      (m) =>
        m.status === "ready" &&
        wanted.every((id) => m.sides.some((s) => s.entrantId === id)),
    );
    if (candidates.length === 1) return candidates[0]!;
    if (candidates.length > 1) {
      throw new Error(`${reference} matches more than one fixture. Use the match id.`);
    }
  }

  throw new Error(`No fixture "${reference}". Run \`bracketeer matches --ready\` to see them.`);
}

/**
 * Turn what a person typed into the result shape this tournament records.
 *
 * The engine keeps one switch on `score.kind`, in its normalisation seam, and
 * that one is about *reading* results. This is the other direction — parsing a
 * human's input — and it belongs to the host, which is why the browser has its
 * own version of it in `ScoreEntry.tsx`.
 */
export function parseScore(config: ScoreConfig, input: string): MatchResult {
  const text = input.trim();

  switch (config.kind) {
    case "points": {
      return { kind: "points", scores: splitNumbers(text) };
    }
    case "sets": {
      const sets = text
        .split(",")
        .map((set) => splitNumbers(set))
        .filter((set) => set.length > 0);
      if (sets.length === 0) throw new Error(`Could not read "${input}" as sets, e.g. "11-9,9-11,11-6".`);
      return { kind: "sets", sets };
    }
    case "outcome": {
      if (/^draw$/i.test(text)) return { kind: "outcome", winner: null };
      const side = Number(text);
      if (!Number.isFinite(side)) {
        throw new Error(`Could not read "${input}". Give the winning side (1 or 2) or "draw".`);
      }
      return { kind: "outcome", winner: side - 1 };
    }
    case "placement": {
      // "2,1,3" means side 1 came second, side 2 first, side 3 third.
      const finishing = splitNumbers(text);
      const places: number[][] = [];
      finishing.forEach((place, sideIndex) => {
        const tier = place - 1;
        (places[tier] ??= []).push(sideIndex);
      });
      return { kind: "placement", places: places.filter(Boolean) };
    }
    case "time": {
      const times = text
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((value) => (/^(dnf|-)$/i.test(value) ? null : Number(value)));
      if (times.some((t) => t !== null && !Number.isFinite(t))) {
        throw new Error(`Could not read "${input}" as times, e.g. "10.2,11.4" or "10.2,dnf".`);
      }
      return { kind: "time", times };
    }
  }
}

/**
 * Every non-numeric run is a separator, so "13-7", "13–7", "13:7" and "13 x 7"
 * all read the same. People type whichever one is on their keyboard, and an
 * en-dash arrives whenever a score was pasted from anywhere at all.
 */
function splitNumbers(text: string): number[] {
  const parts = text
    .split(/[^\d.]+/)
    .filter(Boolean)
    .map(Number);

  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`Could not read "${text}" as a score, e.g. "13-7".`);
  }
  return parts;
}

export function report(
  log: EventLog,
  input: { match: string; score: string; actor: string },
): Outcome<MatchView> {
  const state = replay(log);
  const match = resolveMatch(state, input.match);
  const result = parseScore(state.config.score, input.score);

  const after = apply(log, input.actor, [{ type: "result_reported", matchId: match.id, result }]);
  const updated = replay(after);
  return { log: after, result: viewOf(updated, findMatch(updated, match.id)!) };
}

export function clearResult(
  log: EventLog,
  input: { match: string; actor: string },
): Outcome<{ match: string }> {
  const state = replay(log);
  const match = resolveMatch(state, input.match);
  return {
    log: apply(log, input.actor, [{ type: "result_cleared", matchId: match.id }]),
    result: { match: match.id },
  };
}

export function voidMatch(
  log: EventLog,
  input: { match: string; reason: string; actor: string },
): Outcome<{ match: string }> {
  const state = replay(log);
  const match = resolveMatch(state, input.match);
  return {
    log: apply(log, input.actor, [
      { type: "match_voided", matchId: match.id, reason: input.reason },
    ]),
    result: { match: match.id },
  };
}

export function restoreMatch(
  log: EventLog,
  input: { match: string; actor: string },
): Outcome<{ match: string }> {
  const state = replay(log);
  const match = resolveMatch(state, input.match);
  return {
    log: apply(log, input.actor, [{ type: "match_restored", matchId: match.id }]),
    result: { match: match.id },
  };
}

export function undo(log: EventLog, actor: string): Outcome<{ removed: boolean }> {
  const after = undoLast(log, actor);
  return { log: after, result: { removed: after.length !== log.length } };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Reading it
 * ──────────────────────────────────────────────────────────────────────────── */

export interface StandingView {
  rank: number;
  entrant: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  pointsFor: number;
  pointsAgainst: number;
  metrics: Record<string, number>;
  tiedWithNext: boolean;
}

export function standings(
  log: EventLog,
  input: { stage?: string; group?: string; overall?: boolean } = {},
): StandingView[] {
  const state = replay(log);

  let rows: StandingRow[];
  if (input.overall || state.stages.length > 1) {
    rows = overallStandings(state);
  } else {
    const stage = input.stage ?? currentStageId(state);
    if (!stage) return [];
    rows = input.group ? groupStandings(state, stage, input.group) : stageStandings(state, stage);
  }

  return rows.map((row) => ({
    rank: row.rank,
    entrant: findEntrant(state, row.entrantId)?.name ?? row.entrantId,
    played: row.record.played,
    wins: row.record.wins,
    draws: row.record.draws,
    losses: row.record.losses,
    points: row.record.competitionPoints,
    pointsFor: row.record.pointsFor,
    pointsAgainst: row.record.pointsAgainst,
    metrics: row.metrics,
    tiedWithNext: row.tiedWithNext,
  }));
}

export function ratings(log: EventLog): { entrant: string; rating: number; played: number }[] {
  const state = replay(log);
  const table = computeRatings(state);
  const values = ratingValues(table);

  return [...values.entries()]
    .map(([id, rating]) => ({
      entrant: findEntrant(state, id)?.name ?? id,
      rating: Math.round(rating * 10) / 10,
      played: table.get(id)?.matchesPlayed ?? 0,
    }))
    .sort((a, b) => b.rating - a.rating);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Scheduling
 * ──────────────────────────────────────────────────────────────────────────── */

export function planTimes(
  log: EventLog,
  input: { startsAt?: string; actor: string },
): Outcome<{ scheduled: number }> {
  const state = replay(log);
  const slots = planSchedule(state.matches, state.config.schedule, input.startsAt);
  const events = scheduleEvents(slots);
  return { log: apply(log, input.actor, events), result: { scheduled: slots.length } };
}

export function conflicts(log: EventLog) {
  const state = replay(log);
  return findConflicts(state, state.config.schedule);
}

export function icsOf(log: EventLog): string {
  return toIcs(replay(log));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Sharing
 * ──────────────────────────────────────────────────────────────────────────── */

export interface LinkResult {
  url: string;
  audience: Audience;
  kilobytes: number;
  verdict: string;
  /** Named so a caller can repeat the warning rather than invent one. */
  note: string;
}

/**
 * A link into the web app.
 *
 * The redaction is the engine's, not a second copy: a watch link built here
 * carries exactly what a watch link built in the browser carries. That is the
 * only way this can be trusted, because two implementations of "what a
 * spectator may see" is one implementation and one accident waiting.
 */
export function link(
  log: EventLog,
  input: { id: string; audience: Audience; writeKey?: string },
): LinkResult {
  const state = replay(log);
  const encoded = encode(logFor(log, state.config, input.audience));
  const verdict = urlSizeVerdict(encoded);

  const origin = siteOrigin();
  const key = input.audience === "run" && input.writeKey ? `&k=${input.writeKey}` : "";
  const url = `${origin}#/t/${input.id}?d=${encoded}${key}`;

  const note =
    verdict === "too_long"
      ? "This tournament has outgrown a URL. Send the exported file instead."
      : input.audience === "run"
        ? "Whoever opens this can enter scores. Send it to the people helping, not to the room."
        : "Results only. Private fields are not in this link — not hidden inside it, absent.";

  return {
    url: verdict === "too_long" ? "" : url,
    audience: input.audience,
    kilobytes: Math.round((encoded.length / 1024) * 10) / 10,
    verdict,
    note,
  };
}

/** What a given audience would actually receive, for checking before sending. */
export function exportFor(log: EventLog, audience: Audience): EventLog {
  return logFor(log, replay(log).config, audience);
}
