/**
 * The MCP server.
 *
 * The same operations as the CLI, offered as tools instead of commands. It is
 * deliberately thin: if a tool here did anything the CLI cannot, the two would
 * start to disagree about what a tournament is, and one of them would be wrong
 * about redaction.
 *
 * Tools take a `tournament` id and load and save around each call, so several
 * conversations can act on the same tournament without holding it in memory.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readShape } from "@bracketeer/engine";
import { z } from "zod";
import * as ops from "./ops.js";
import { list, load, randomId, randomSeed, save } from "./store.js";

const ACTOR = process.env.BRACKETEER_ACTOR ?? "mcp";

const server = new McpServer({ name: "bracketeer", version: "0.1.0" });

/** Every tool answers with JSON, because the caller is a model, not a terminal. */
function reply(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function fail(cause: unknown) {
  return {
    content: [
      { type: "text" as const, text: cause instanceof Error ? cause.message : String(cause) },
    ],
    isError: true,
  };
}

/**
 * Two shapes of tool, so no handler has to remember to save or to catch.
 *
 * Arguments are loosened at this boundary deliberately: the SDK has already
 * validated them against the declared schema by the time a handler runs, and the
 * alternative is threading its generics through every registration for no
 * additional safety.
 */
type ToolArgs = Record<string, any>;

/** Read-only tools. */
function reads(
  name: string,
  description: string,
  inputSchema: z.ZodRawShape,
  run: (args: ToolArgs) => unknown,
) {
  server.registerTool(name, { description, inputSchema }, ((args: ToolArgs) => {
    try {
      return reply(run(args));
    } catch (cause) {
      return fail(cause);
    }
  }) as never);
}

/** Tools that change the log, saving it back under the same id. */
function writes(
  name: string,
  description: string,
  inputSchema: z.ZodRawShape,
  run: (args: ToolArgs) => ops.Outcome<unknown>,
) {
  server.registerTool(name, { description, inputSchema }, ((args: ToolArgs) => {
    try {
      const outcome = run(args);
      save(String(args.tournament), outcome.log);
      return reply(outcome.result);
    } catch (cause) {
      return fail(cause);
    }
  }) as never);
}

const tournament = z.string().describe("The tournament id returned by create_tournament.");

/* ── Starting points ──────────────────────────────────────────────────────── */

reads(
  "list_shapes",
  "The structures a tournament can have, named for what they do rather than for a sport. Use this before creating one.",
  {},
  () => ops.listShapes(),
);

reads(
  "list_sports",
  "Sports, each offering formats that are a shape with the scoring and tiebreaks already filled in.",
  {},
  () => ops.listSports(),
);

reads(
  "describe_shape",
  "What a shape actually produces — rounds, brackets, how many qualify — read from a sample tournament the engine plays, not from a description.",
  {
    shape: z.string().optional().describe("A shape id from list_shapes."),
    sport: z.string().optional().describe("A sport or format id from list_sports."),
  },
  (args) => {
    const start = ops.resolveStart({ shape: args.shape, sport: args.sport });
    return { name: start.name, ...readShape(start.config) };
  },
);

reads("list_tournaments", "Tournaments stored on this machine.", {}, () => list());

/* ── Setup ────────────────────────────────────────────────────────────────── */

reads(
  "create_tournament",
  "Start a tournament from a shape or a sport format, with an optional list of entrants in seeding order. Returns the id every other tool takes.",
  {
    name: z.string().optional(),
    shape: z.string().optional().describe("A shape id from list_shapes."),
    sport: z.string().optional().describe("A sport or format id from list_sports."),
    entrants: z
      .array(z.string())
      .optional()
      .describe("Strongest first; the order becomes the seeding."),
    seed: z.number().optional().describe("Fixes every draw. Omit for a random one."),
  },
  (args) => {
    const id = randomId();
    const outcome = ops.create({
      name: args.name,
      shape: args.shape,
      sport: args.sport,
      entrants: args.entrants,
      seed: args.seed ?? randomSeed(),
      actor: ACTOR,
    });
    const file = save(id, outcome.log);
    return { tournament: id, file, ...outcome.result };
  },
);

writes(
  "add_entrants",
  "Add entrants. They join at the end of the seeding, and only enter a stage that has not started.",
  { tournament, names: z.array(z.string()) },
  (args) => ops.addEntrants(load(args.tournament), { names: args.names, actor: ACTOR }),
);

reads("list_entrants", "Everyone in the tournament, with their seed and status.", { tournament }, (args) =>
  ops.listEntrants(load(args.tournament)),
);

writes(
  "withdraw_entrant",
  "Take someone out of future draws while keeping the matches they already played.",
  { tournament, entrant: z.string().describe("An entrant id or name.") },
  (args) =>
    ops.setEntrantStatus(load(args.tournament), {
      entrant: args.entrant,
      status: "withdrawn",
      actor: ACTOR,
    }),
);

/* ── Running it ───────────────────────────────────────────────────────────── */

reads(
  "status",
  "Where the tournament is and what to do next. Call this when unsure which tool to use.",
  { tournament },
  (args) => ops.status(load(args.tournament)),
);

writes(
  "start_stage",
  "Start a stage: make the draw and create its first fixtures. Without a stage id, starts the next one that has not begun.",
  { tournament, stage: z.string().optional() },
  (args) => ops.start(load(args.tournament), { stage: args.stage, actor: ACTOR }),
);

writes(
  "advance",
  "Pair the next round, or open the next stage. Reports moved:false while results are still outstanding — that is a normal state, not a failure.",
  { tournament, stage: z.string().optional() },
  (args) => ops.advance(load(args.tournament), { stage: args.stage, actor: ACTOR }),
);

reads(
  "list_matches",
  "Fixtures. Use ready_only to get exactly the ones that can be played now.",
  {
    tournament,
    stage: z.string().optional(),
    ready_only: z.boolean().optional(),
  },
  (args) =>
    ops.listMatches(load(args.tournament), {
      stage: args.stage,
      only: args.ready_only ? "ready" : "all",
    }),
);

writes(
  "report_result",
  'Record a result. The score is written the way this tournament scores: "13-7" for points, "11-9,9-11,11-6" for sets, "1" or "draw" for an outcome, "2,1,3" for finishing places, "10.2,11.4" for times.',
  {
    tournament,
    match: z.string().describe('A match id, or a fixture like "Marie v Luc".'),
    score: z.string(),
  },
  (args) =>
    ops.report(load(args.tournament), { match: args.match, score: args.score, actor: ACTOR }),
);

writes(
  "clear_result",
  "Undo a reported result. Everything downstream — standings, ratings, later fixtures — is re-derived.",
  { tournament, match: z.string() },
  (args) => ops.clearResult(load(args.tournament), { match: args.match, actor: ACTOR }),
);

/* ── Reading it ───────────────────────────────────────────────────────────── */

reads(
  "standings",
  "The table, with ties broken in the configured order. Reports tiedWithNext where the tiebreakers could not separate two entrants.",
  {
    tournament,
    stage: z.string().optional(),
    group: z.string().optional(),
    overall: z.boolean().optional(),
  },
  (args) =>
    ops.standings(load(args.tournament), {
      stage: args.stage,
      group: args.group,
      overall: args.overall,
    }),
);

reads(
  "ratings",
  "Ratings, derived by replaying every match rather than stored — so correcting an old score fixes everything after it.",
  { tournament },
  (args) => ops.ratings(load(args.tournament)),
);

/* ── Sharing ──────────────────────────────────────────────────────────────── */

reads(
  "share_link",
  'A link into the web app. "watch" is the default and carries results with every private field absent — not hidden, absent. "run" carries everything and lets whoever opens it enter scores, so only send it to people helping run the tournament.',
  {
    tournament,
    audience: z.enum(["watch", "run"]).optional(),
    write_key: z.string().optional().describe("Required for a run link to allow score entry."),
  },
  (args) =>
    ops.link(load(args.tournament), {
      id: args.tournament,
      audience: args.audience ?? "watch",
      writeKey: args.write_key,
    }),
);

await server.connect(new StdioServerTransport());
