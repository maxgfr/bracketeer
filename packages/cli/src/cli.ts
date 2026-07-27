/**
 * The command line.
 *
 * Parsing and printing only — every decision lives in `ops.ts`, which the MCP
 * server drives through the same functions.
 *
 * Two output modes on purpose. A person reading a terminal wants columns; an
 * agent wants `--json`, and gets the same object the MCP server returns. Neither
 * is a reformatting of the other's text.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fromJsonFile, readShape, type Audience, type TournamentConfigInput } from "@bracketeer/engine";
import * as ops from "./ops.js";
import { list, load, pathFor, randomId, randomSeed, save } from "./store.js";
import { VERSION } from "./version.js";

interface Args {
  command: string;
  positional: string[];
  /** Every occurrence, in order — `--set` is meant to be repeated. */
  flags: Record<string, (string | true)[]>;
}

function parseArgs(argv: readonly string[]): Args {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, (string | true)[]> = {};

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i]!;
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    const next = rest[i + 1];
    (flags[name] ??= []).push(next === undefined || next.startsWith("--") ? true : next);
    if (next !== undefined && !next.startsWith("--")) i += 1;
  }

  return { command, positional, flags };
}

/** The last one given, so a repeated flag means what somebody typed most recently. */
const str = (args: Args, name: string): string | undefined => {
  const values = (args.flags[name] ?? []).filter((v): v is string => typeof v === "string");
  return values[values.length - 1];
};

/** Every one given, for flags that accumulate. */
const all = (args: Args, name: string): string[] =>
  (args.flags[name] ?? []).filter((v): v is string => typeof v === "string");

const bool = (args: Args, name: string): boolean => (args.flags[name] ?? []).includes(true);

/** The tournament being worked on: an explicit id, or the most recent one. */
function targetId(args: Args): string {
  const explicit = str(args, "file") ?? str(args, "id") ?? args.positional[0];
  if (explicit) return explicit;

  const recent = list()[0];
  if (!recent) throw new Error("No tournaments yet. Start one with `bracketeer new`.");
  return recent.id;
}

/** One device, one identity in the log, so its events stay a single sequence. */
function actorId(): string {
  return process.env.BRACKETEER_ACTOR ?? "cli";
}

/* ────────────────────────────────────────────────────────────────────────────
 * Rendering
 * ──────────────────────────────────────────────────────────────────────────── */

function table(rows: readonly object[], columns: readonly string[]): string {
  if (rows.length === 0) return "(nothing)";

  const cell = (row: object, column: string) =>
    String((row as Record<string, unknown>)[column] ?? "");

  const widths = columns.map((c) => Math.max(c.length, ...rows.map((r) => cell(r, c).length)));
  const line = (cells: readonly string[]) =>
    cells.map((cell, i) => cell.padEnd(widths[i]!)).join("  ").trimEnd();

  return [
    line(columns),
    line(columns.map((_, i) => "─".repeat(widths[i]!))),
    ...rows.map((r) => line(columns.map((c) => cell(r, c)))),
  ].join("\n");
}

function emit(args: Args, value: unknown, human: () => string): void {
  if (bool(args, "json")) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(human());
}

const HELP = `bracketeer ${VERSION} — run a tournament from the terminal

  Starting points
    shapes                          the structures, named for what they do
    sports                          sports, each a shape with the scoring filled in
    describe --shape <id>           what a shape actually produces, played out

  Setting up
    new [--name <text>] [--shape <id> | --sport <id> | --config <file.json>]
        [--entrants "A,B,C"] [--seed <n>]
    entrants [--json]
    add "Name" ["Name" …]
    update <entrant> [--name <text>] [--seed <n>] [--set key=value …]
    withdraw <entrant>              keep them in the record, out of the draw
    remove <entrant>

  Running it
    status                          where things are, and what to do next
    start [--stage <id>]
    matches [--ready] [--stage <id>]
    report <match> --score "13-7"   match is an id, or "Marie v Luc"
    clear <match>
    void <match> --reason <text>    ·  restore <match>
    advance [--stage <id>]          pair the next round, or open the next stage
    undo

  Reading it
    standings [--stage <id>] [--group <id>] [--overall]
    ratings

  Calendar
    schedule [--starts-at <iso>]  ·  conflicts  ·  ics [--out <file>]

  Sharing
    link [--for watch|run]          watch by default: results, no private fields
    export [--for watch|run] [--out <file>]
    import <file.json>

  Every command takes --json, and --file <path> or an id to pick a tournament.
  Without one, the most recently changed tournament is used.

  Tournaments are files in ~/.bracketeer (override with BRACKETEER_HOME).`;

/* ────────────────────────────────────────────────────────────────────────────
 * Commands
 * ──────────────────────────────────────────────────────────────────────────── */

function run(args: Args): void {
  const actor = actorId();

  switch (args.command) {
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;

    case "version":
    case "--version":
      console.log(VERSION);
      return;

    case "shapes": {
      const shapes = ops.listShapes();
      emit(args, shapes, () => table(shapes, ["id", "name", "signature", "matchesEach"]));
      return;
    }

    case "sports": {
      const sports = ops.listSports();
      emit(args, sports, () =>
        sports
          .map(
            (s) =>
              `${s.name}\n  ${s.note}\n` +
              s.formats.map((f) => `  ${f.id.padEnd(24)} ${f.name} — ${f.basedOn}`).join("\n"),
          )
          .join("\n\n"),
      );
      return;
    }

    case "describe": {
      const start = ops.resolveStart({
        shape: str(args, "shape") ?? args.positional[0],
        sport: str(args, "sport"),
      });
      // Play it rather than describe it, so this cannot claim a structure the
      // rules do not produce.
      const shape = readShape(start.config);
      emit(args, shape, () =>
        [
          start.name,
          ...shape.stages.map(
            (s) =>
              `  ${s.name} (${s.kind})` +
              (s.groupCount > 0 ? ` — ${s.groupCount} groups` : "") +
              `\n    ${s.brackets.map((b) => `${b.slot}: ${b.rounds.join(" → ")}`).join("\n    ")}` +
              (s.qualifiers === null ? "" : `\n    ${s.qualifiers} go through`),
          ),
        ].join("\n"),
      );
      return;
    }

    case "list": {
      const stored = list();
      emit(args, stored, () => table(stored, ["id", "updatedAt", "file"]));
      return;
    }

    case "new": {
      const id = str(args, "as") ?? randomId();
      const configFile = str(args, "config");
      const outcome = ops.create({
        name: str(args, "name"),
        shape: str(args, "shape"),
        sport: str(args, "sport"),
        config: configFile
          ? (JSON.parse(readFileSync(configFile, "utf8")) as TournamentConfigInput)
          : undefined,
        entrants: splitList(str(args, "entrants")),
        seed: Number(str(args, "seed") ?? randomSeed()),
        actor,
      });

      const file = save(id, outcome.log);
      emit(args, { id, file, ...outcome.result }, () =>
        [
          `${outcome.result.name}`,
          `  id        ${id}`,
          `  entrants  ${outcome.result.entrants}`,
          `  stages    ${outcome.result.stages.join(" → ")}`,
          `  file      ${file}`,
          ``,
          `Next: bracketeer start ${id}`,
        ].join("\n"),
      );
      return;
    }

    case "add": {
      const id = targetId(args);
      const names = args.positional.slice(idWasPositional(args) ? 1 : 0);
      const outcome = ops.addEntrants(load(id), { names, actor });
      save(id, outcome.log);
      emit(args, outcome.result, () => `Added ${outcome.result.added.length}.`);
      return;
    }

    case "entrants": {
      const id = targetId(args);
      const log = load(id);
      const rows = ops.listEntrants(log);
      emit(args, rows, () => `${ops.status(log).name}\n${table(rows, ["id", "name", "seed", "status"])}`);
      return;
    }

    case "withdraw":
    case "reinstate": {
      const id = targetId(args);
      const who = args.positional[idWasPositional(args) ? 1 : 0];
      if (!who) throw new Error("Which entrant?");
      const outcome = ops.setEntrantStatus(load(id), {
        entrant: who,
        status: args.command === "withdraw" ? "withdrawn" : "active",
        actor,
      });
      save(id, outcome.log);
      emit(args, outcome.result, () => `${outcome.result.id} is ${outcome.result.status}.`);
      return;
    }

    case "update": {
      const id = targetId(args);
      const who = args.positional[idWasPositional(args) ? 1 : 0];
      if (!who) throw new Error("Which entrant?");

      /*
       * `--set key=value`, repeatable. This is how a private field gets a value
       * from here at all: the field is defined in the configuration, and until
       * something can fill it in, "private" is a promise about data nobody can
       * enter.
       */
      const meta: Record<string, string> = {};
      for (const pair of all(args, "set")) {
        const at = pair.indexOf("=");
        if (at < 1) throw new Error(`--set wants key=value, not "${pair}".`);
        meta[pair.slice(0, at)] = pair.slice(at + 1);
      }

      const seed = str(args, "seed");
      const outcome = ops.updateEntrant(load(id), {
        entrant: who,
        name: str(args, "name"),
        seed: seed === undefined ? undefined : seed === "none" ? null : Number(seed),
        meta: Object.keys(meta).length > 0 ? meta : undefined,
        actor,
      });
      save(id, outcome.log);
      emit(args, outcome.result, () => `Updated ${outcome.result.id}.`);
      return;
    }

    case "remove": {
      const id = targetId(args);
      const who = args.positional[idWasPositional(args) ? 1 : 0];
      if (!who) throw new Error("Which entrant?");
      const outcome = ops.removeEntrant(load(id), { entrant: who, actor });
      save(id, outcome.log);
      emit(args, outcome.result, () => `Removed ${outcome.result.id}.`);
      return;
    }

    case "status": {
      const id = targetId(args);
      const report = ops.status(load(id));
      emit(args, report, () =>
        [
          report.name,
          table(report.stages, ["id", "kind", "started", "complete", "entrants", "groups"]),
          ``,
          `${report.played}/${report.total} played · ${report.ready} ready · ${report.entrants} entrants`,
          `Next: ${report.next}`,
        ].join("\n"),
      );
      return;
    }

    case "start": {
      const id = targetId(args);
      const outcome = ops.start(load(id), { stage: str(args, "stage"), actor });
      save(id, outcome.log);
      emit(
        args,
        outcome.result,
        () => `Started "${outcome.result.stage}" — ${outcome.result.matches} fixtures.`,
      );
      return;
    }

    case "advance": {
      const id = targetId(args);
      const outcome = ops.advance(load(id), { stage: str(args, "stage"), actor });
      if (outcome.result.moved) save(id, outcome.log);
      emit(args, outcome.result, () => outcome.result.note);
      return;
    }

    case "matches": {
      const id = targetId(args);
      const rows = ops.listMatches(load(id), {
        stage: str(args, "stage"),
        only: bool(args, "ready") ? "ready" : bool(args, "played") ? "complete" : "all",
      });
      emit(args, rows, () =>
        table(
          rows.map((m) => ({
            id: m.id,
            fixture: m.sides.map((s) => s.entrant ?? "—").join(" v "),
            status: m.status,
            score: m.score ?? "",
          })),
          ["id", "fixture", "status", "score"],
        ),
      );
      return;
    }

    case "report": {
      const id = targetId(args);
      const match = args.positional[idWasPositional(args) ? 1 : 0];
      const score = str(args, "score");
      if (!match) throw new Error("Which fixture? Use a match id, or \"Marie v Luc\".");
      if (!score) throw new Error('Give a score, e.g. --score "13-7".');

      const outcome = ops.report(load(id), { match, score, actor });
      save(id, outcome.log);
      emit(
        args,
        outcome.result,
        () =>
          `${outcome.result.sides.map((s) => s.entrant ?? "—").join(" v ")}  ${outcome.result.score ?? ""}`,
      );
      return;
    }

    case "clear": {
      const id = targetId(args);
      const match = args.positional[idWasPositional(args) ? 1 : 0];
      if (!match) throw new Error("Which fixture?");
      const outcome = ops.clearResult(load(id), { match, actor });
      save(id, outcome.log);
      emit(args, outcome.result, () => `Cleared ${outcome.result.match}.`);
      return;
    }

    case "void": {
      const id = targetId(args);
      const match = args.positional[idWasPositional(args) ? 1 : 0];
      if (!match) throw new Error("Which fixture?");
      const outcome = ops.voidMatch(load(id), {
        match,
        reason: str(args, "reason") ?? "voided",
        actor,
      });
      save(id, outcome.log);
      emit(args, outcome.result, () => `Voided ${outcome.result.match}.`);
      return;
    }

    case "restore": {
      const id = targetId(args);
      const match = args.positional[idWasPositional(args) ? 1 : 0];
      if (!match) throw new Error("Which fixture?");
      const outcome = ops.restoreMatch(load(id), { match, actor });
      save(id, outcome.log);
      emit(args, outcome.result, () => `Restored ${outcome.result.match}.`);
      return;
    }

    case "undo": {
      const id = targetId(args);
      const outcome = ops.undo(load(id), actor);
      save(id, outcome.log);
      emit(args, outcome.result, () =>
        outcome.result.removed ? "Undid the last change." : "Nothing of yours to undo.",
      );
      return;
    }

    case "standings": {
      const id = targetId(args);
      const rows = ops.standings(load(id), {
        stage: str(args, "stage"),
        group: str(args, "group"),
        overall: bool(args, "overall"),
      });
      emit(args, rows, () =>
        table(rows, ["rank", "entrant", "played", "wins", "draws", "losses", "points"]),
      );
      return;
    }

    case "ratings": {
      const id = targetId(args);
      const rows = ops.ratings(load(id));
      emit(args, rows, () => table(rows, ["entrant", "rating", "played"]));
      return;
    }

    case "schedule": {
      const id = targetId(args);
      const outcome = ops.planTimes(load(id), { startsAt: str(args, "starts-at"), actor });
      save(id, outcome.log);
      emit(args, outcome.result, () => `Scheduled ${outcome.result.scheduled} fixtures.`);
      return;
    }

    case "conflicts": {
      const id = targetId(args);
      const found = ops.conflicts(load(id));
      emit(args, found, () =>
        found.length === 0 ? "No clashes." : found.map((c) => JSON.stringify(c)).join("\n"),
      );
      return;
    }

    case "ics": {
      const id = targetId(args);
      const text = ops.icsOf(load(id));
      const out = str(args, "out");
      if (out) {
        writeFileSync(out, text);
        console.log(out);
      } else {
        console.log(text);
      }
      return;
    }

    case "link": {
      const id = targetId(args);
      const result = ops.link(load(id), {
        id,
        audience: audienceOf(args),
        writeKey: str(args, "key"),
      });
      emit(args, result, () =>
        result.url ? `${result.url}\n\n${result.note} (${result.kilobytes} kB)` : result.note,
      );
      return;
    }

    case "export": {
      const id = targetId(args);
      const audience = audienceOf(args);
      const log = ops.exportFor(load(id), audience);
      const out = str(args, "out") ?? `${id}${audience === "watch" ? ".public" : ""}.bracketeer.json`;
      save(out, log);
      emit(args, { file: pathFor(out), audience }, () => `${pathFor(out)} (${audience})`);
      return;
    }

    case "import": {
      const source = args.positional[0];
      if (!source) throw new Error("Which file?");
      const log = fromJsonFile(readFileSync(source, "utf8"));
      const id = str(args, "as") ?? randomId();
      const file = save(id, log);
      emit(args, { id, file }, () => `${id}\n${file}`);
      return;
    }

    default:
      throw new Error(`No command "${args.command}". Run \`bracketeer help\`.`);
  }
}

function audienceOf(args: Args): Audience {
  const value = str(args, "for") ?? "watch";
  if (value !== "watch" && value !== "run") {
    throw new Error(`--for takes "watch" or "run", not "${value}".`);
  }
  return value;
}

function splitList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Whether the first positional was the tournament, so the rest can be read.
 * `bracketeer report abc123 m1 --score …` and `bracketeer report m1 --score …`
 * both have to work, because one of them is what somebody will type.
 */
function idWasPositional(args: Args): boolean {
  if (str(args, "file") ?? str(args, "id")) return false;
  const first = args.positional[0];
  if (!first) return false;
  return list().some((t) => t.id === first);
}

try {
  run(parseArgs(process.argv.slice(2)));
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exit(1);
}
