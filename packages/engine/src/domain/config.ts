/**
 * The configuration contract.
 *
 * A tournament is described by six orthogonal axes. There is deliberately no
 * "sport" concept anywhere: pétanque, chess, a football league and a Mario Kart
 * night are all points in this space, reached by composition rather than by a
 * special case in the engine.
 *
 *   1. entrant + match shape   who plays, and how many sides meet in one match
 *   2. score                   how a result is expressed
 *   3. structure               the shape of the competition, as a pipeline of stages
 *   4. consolation             what happens to the people who lose
 *   5. pairing                 who plays whom, and the constraints on that choice
 *   6. standings               how points are awarded and ties are broken
 *
 * Ratings sit alongside as a seventh, optional concern.
 *
 * Every field has a default, so `parseConfig({})` yields a runnable tournament
 * and callers only ever specify their deltas.
 */

import { z } from "zod";

/* ────────────────────────────────────────────────────────────────────────────
 * Axis 1 — entrants and match shape
 * ──────────────────────────────────────────────────────────────────────────── */

export const entrantConfigSchema = z
  .discriminatedUnion("kind", [
    /** One person or one machine per side. */
    z.object({ kind: z.literal("individual") }),
    /** Teams with a roster that is fixed for the whole event. */
    z.object({
      kind: z.literal("fixed_team"),
      /** null = teams may have any size (useful for casual events). */
      teamSize: z.number().int().min(1).nullable().default(null),
    }),
    /**
     * Teams recomposed from a pool of players. This is the pétanque *mêlée* and
     * the padel *americano*: you enter alone and your partners change.
     */
    z.object({
      kind: z.literal("drawn_team"),
      teamSize: z.number().int().min(2).default(2),
      /** Redraw partners every round, or draw once and keep them. */
      redrawEachRound: z.boolean().default(true),
    }),
  ])
  .default({ kind: "individual" });

export const matchShapeSchema = z
  .object({
    /** 2 is head-to-head. 3+ is a free-for-all: a race, a battle royale, a heat. */
    sidesPerMatch: z.number().int().min(2).default(2),
    /**
     * Whether one side is designated "home". Drives home/away balancing and the
     * side ordering shown in fixtures.
     */
    hasHomeSide: z.boolean().default(false),
  })
  .default({});

/* ────────────────────────────────────────────────────────────────────────────
 * Axis 2 — how a result is expressed
 * ──────────────────────────────────────────────────────────────────────────── */

export const scoreConfigSchema = z
  .discriminatedUnion("kind", [
    /**
     * A raw number per side. Covers pétanque (first to 13), football goals,
     * basketball, darts — anything counted.
     */
    z.object({
      kind: z.literal("points"),
      /** First to N wins. null for open-ended scoring such as goals. */
      target: z.number().int().positive().nullable().default(null),
      /** Hard ceiling, if scores are capped below the target. */
      cap: z.number().int().positive().nullable().default(null),
      allowDraw: z.boolean().default(false),
      /** Does the size of the win carry information? Drives point-difference tiebreaks. */
      marginMeaningful: z.boolean().default(true),
      /** Reject non-integer scores. */
      integerOnly: z.boolean().default(true),
    }),
    /** Sets, games or legs: tennis, volleyball, table tennis, most esports. */
    z.object({
      kind: z.literal("sets"),
      bestOf: z.number().int().min(1).default(3),
      /** Points needed to take a set. null when only the set winner is recorded. */
      setTarget: z.number().int().positive().nullable().default(null),
      /** Must win a set by this margin (2 for tennis and volleyball). */
      setWinBy: z.number().int().min(1).default(1),
      /** A different target for the deciding set, e.g. a 10-point tiebreak. */
      decidingSetTarget: z.number().int().positive().nullable().default(null),
      allowDraw: z.boolean().default(false),
    }),
    /** Only the verdict matters. Chess without recorded scores, or any binary sport. */
    z.object({
      kind: z.literal("outcome"),
      allowDraw: z.boolean().default(true),
    }),
    /**
     * An ordered finish across 3+ sides: racing, battle royale, a Mario Kart
     * cup, a shooting heat.
     */
    z.object({
      kind: z.literal("placement"),
      /** Points awarded by finishing position, best first. Falls back to reverse order. */
      pointsByPlace: z.array(z.number()).default([]),
      allowTies: z.boolean().default(false),
    }),
    /** A measured duration or distance. */
    z.object({
      kind: z.literal("time"),
      /** True for a sprint, false for "time survived" or a distance thrown. */
      lowerIsBetter: z.boolean().default(true),
      allowDraw: z.boolean().default(false),
    }),
  ])
  .default({ kind: "points" });

/* ────────────────────────────────────────────────────────────────────────────
 * Axis 6 — points and tiebreakers
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Bonus points, expressed against signals every score kind can produce, so the
 * rule works whatever the sport. A rugby losing bonus is `loss_margin_at_most: 7`.
 */
export const bonusRuleSchema = z.object({
  id: z.string(),
  label: z.string().default(""),
  condition: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("win_margin_at_least"), value: z.number() }),
    z.object({ kind: z.literal("loss_margin_at_most"), value: z.number() }),
    z.object({ kind: z.literal("points_for_at_least"), value: z.number() }),
    /** The opponent failed to score at all. */
    z.object({ kind: z.literal("shutout") }),
  ]),
  points: z.number().default(1),
});

export const pointsSystemSchema = z
  .object({
    win: z.number().default(1),
    draw: z.number().default(0.5),
    loss: z.number().default(0),
    /** A round off counts as this. Chess and Swiss pétanque usually award a full win. */
    bye: z.number().default(1),
    forfeitWin: z.number().default(1),
    forfeitLoss: z.number().default(0),
    /**
     * Results settled after regulation. Ice hockey's 3-2-1-0 is
     * win 3 / otWin 2 / otLoss 1 / loss 0.
     */
    overtimeWin: z.number().nullable().default(null),
    overtimeLoss: z.number().nullable().default(null),
    bonusRules: z.array(bonusRuleSchema).default([]),
  })
  .default({});

export const tiebreakerKeySchema = z.enum([
  /** Competition points from the points system above. */
  "points",
  "wins",
  /** Results between the tied entrants only. */
  "head_to_head",
  /** Sum of your opponents' points — how hard was your draw. */
  "buchholz",
  /** Buchholz with the best and worst opponent dropped. */
  "median_buchholz",
  /** Opponents you beat count fully, opponents you drew count half. */
  "sonneborn_berger",
  "point_diff",
  "points_for",
  "points_against",
  "opponent_avg_rating",
  "rating",
  "matches_played",
  /** Deterministic draw from the tournament seed — always resolves, never random per device. */
  "drawn_lot",
]);

export const tiebreakerSchema = z.object({
  key: tiebreakerKeySchema,
  /** "desc" means higher is better. Flip it for points_against or matches_played. */
  direction: z.enum(["asc", "desc"]).default("desc"),
});

export const standingsConfigSchema = z
  .object({
    pointsSystem: pointsSystemSchema,
    /**
     * Applied in order until the tie breaks. The final entry should always
     * resolve — `drawn_lot` guarantees a total order.
     */
    tiebreakers: z
      .array(tiebreakerSchema)
      .default([
        { key: "points", direction: "desc" },
        { key: "head_to_head", direction: "desc" },
        { key: "point_diff", direction: "desc" },
        { key: "points_for", direction: "desc" },
        { key: "drawn_lot", direction: "desc" },
      ]),
  })
  .default({});

/* ────────────────────────────────────────────────────────────────────────────
 * Axis 5 — pairing
 * ──────────────────────────────────────────────────────────────────────────── */

export const pairingStrategySchema = z.enum([
  /** Bracket seeding: 1 plays the lowest seed, 2 plays the next, and so on. */
  "seeded",
  /** Drawn from the tournament seed. */
  "random",
  /**
   * Swiss: group entrants on equal records, pair inside each group. This is what
   * makes a narrow loss to the eventual winner survivable.
   */
  "closest_record",
  /** Pair the nearest ratings available, ignoring records. */
  "closest_rating",
  /** Deliberately unequal, so ratings converge faster on a new field. */
  "rating_spread",
  /** Circle method for round robins: every entrant meets every other exactly once per leg. */
  "berger",
]);

/**
 * Constraints are soft costs rather than hard rules. A hard rule can make a
 * round impossible to pair at all; a weighted cost degrades gracefully and
 * simply reports which constraints it had to break.
 */
export const pairingConstraintsSchema = z
  .object({
    avoidRematch: z.object({ enabled: z.boolean().default(true), weight: z.number().default(1000) }).default({}),
    /**
     * Keep entrants sharing a metadata value apart — club, country, or any
     * custom field the organiser defines on entrants.
     */
    avoidSameMeta: z
      .object({
        enabled: z.boolean().default(false),
        field: z.string().default("club"),
        weight: z.number().default(500),
      })
      .default({}),
    /** Spread byes around instead of giving them to the same person twice. */
    balanceByes: z.object({ enabled: z.boolean().default(true), weight: z.number().default(800) }).default({}),
    /** Keep home and away appearances even. Only meaningful when hasHomeSide is set. */
    balanceHomeAway: z.object({ enabled: z.boolean().default(true), weight: z.number().default(100) }).default({}),
    /** How far the solver may search before falling back to a greedy pairing. */
    searchBudget: z.number().int().positive().default(200_000),
  })
  .default({});

export const pairingConfigSchema = z
  .object({
    strategy: pairingStrategySchema.default("seeded"),
    constraints: pairingConstraintsSchema,
    /**
     * Who receives the bye when the field is odd. "lowest_ranked" matches chess
     * convention; "highest_ranked" suits formats that reward the leader.
     */
    byePolicy: z.enum(["lowest_ranked", "highest_ranked", "random"]).default("lowest_ranked"),
  })
  .default({});

/* ────────────────────────────────────────────────────────────────────────────
 * Axes 3 and 4 — structure and consolation
 * ──────────────────────────────────────────────────────────────────────────── */

export const seedingSchema = z
  .object({
    /**
     * "standard" is the classic bracket fold (1v16, 8v9, …) that keeps the top
     * seeds apart. "ordered" fills slots in listed order. "random" draws lots.
     */
    method: z.enum(["standard", "ordered", "random", "manual"]).default("standard"),
    /** For "manual": entrant id per bracket slot, in slot order. */
    slots: z.array(z.string()).default([]),
  })
  .default({});

/**
 * What happens to a competitor who loses.
 *
 * `full_consolation` is the pétanque *consolante* and answers the case of being
 * knocked out in round one by the eventual winner: losers drop into a second
 * bracket and keep playing.
 */
export const consolationSchema = z
  .enum(["none", "third_place", "full_consolation", "repechage"])
  .default("none");

export const qualificationSchema = z
  .object({
    /** How many entrants advance from this stage overall. null = all of them. */
    count: z.number().int().positive().nullable().default(null),
    /** How many advance from each group. Applies to the "groups" structure. */
    perGroup: z.number().int().positive().nullable().default(null),
    /** World Cup style: also take the N best runners-up across groups. */
    bestOfRest: z.number().int().min(0).default(0),
  })
  .default({});

const stageCommon = {
  id: z.string().default("stage"),
  name: z.string().default(""),
  /** Overrides the tournament-level pairing for this stage only. */
  pairing: pairingConfigSchema.optional(),
  /** Overrides the tournament-level standings for this stage only. */
  standings: standingsConfigSchema.optional(),
  qualification: qualificationSchema,
};

const singleEliminationSchema = z.object({
  ...stageCommon,
  kind: z.literal("single_elimination"),
  seeding: seedingSchema,
  consolation: consolationSchema,
});

const doubleEliminationSchema = z.object({
  ...stageCommon,
  kind: z.literal("double_elimination"),
  seeding: seedingSchema,
  /**
   * True if the entrant coming up from the lower bracket must beat the unbeaten
   * finalist twice. False makes the grand final a single match.
   */
  grandFinalReset: z.boolean().default(true),
  consolation: consolationSchema,
});

const roundRobinSchema = z.object({
  ...stageCommon,
  kind: z.literal("round_robin"),
  /** 1 = everyone meets once. 2 = home and away. */
  legs: z.number().int().min(1).default(1),
  /** Reverse home advantage in even-numbered legs. */
  mirrorLegs: z.boolean().default(true),
});

const swissSchema = z.object({
  ...stageCommon,
  kind: z.literal("swiss"),
  /** null derives a sensible count from the field size: ceil(log2(n)). */
  rounds: z.number().int().positive().nullable().default(null),
  /** Stop early once a single entrant is mathematically uncatchable. */
  stopWhenDecided: z.boolean().default(false),
});

const ladderSchema = z.object({
  ...stageCommon,
  kind: z.literal("ladder"),
  /** How many rungs above yourself you are allowed to challenge. */
  challengeRange: z.number().int().min(1).default(3),
  /** The winner takes the loser's rung, rather than the two simply swapping. */
  takeRungOnWin: z.boolean().default(true),
});

/** Stages that a group can run internally. Groups do not nest inside groups. */
const innerStageSchema = z.discriminatedUnion("kind", [
  singleEliminationSchema,
  doubleEliminationSchema,
  roundRobinSchema,
  swissSchema,
  ladderSchema,
]);

const groupsSchema = z.object({
  ...stageCommon,
  kind: z.literal("groups"),
  /** null derives the count from groupSize, or defaults to 4 groups. */
  groupCount: z.number().int().positive().nullable().default(null),
  groupSize: z.number().int().min(2).nullable().default(null),
  /** How seeds are spread across groups. "snake" keeps groups balanced. */
  distribution: z.enum(["snake", "sequential", "random"]).default("snake"),
  /** What each group plays. Usually a round robin. */
  inner: innerStageSchema.default({ kind: "round_robin" }),
});

export const stageConfigSchema = z.discriminatedUnion("kind", [
  singleEliminationSchema,
  doubleEliminationSchema,
  roundRobinSchema,
  swissSchema,
  ladderSchema,
  groupsSchema,
]);

/* ────────────────────────────────────────────────────────────────────────────
 * Ratings
 * ──────────────────────────────────────────────────────────────────────────── */

export const ratingConfigSchema = z
  .object({
    system: z.enum(["none", "elo", "glicko2", "trueskill"]).default("elo"),
    /** Starting rating for an entrant with no history. */
    initial: z.number().default(1000),
    elo: z
      .object({
        k: z.number().positive().default(24),
        /** A larger K while an entrant is still establishing a rating. */
        provisionalK: z.number().positive().default(40),
        provisionalMatches: z.number().int().min(0).default(10),
        /** Scale a rating change by how convincing the win was. */
        marginOfVictory: z.boolean().default(false),
        floor: z.number().nullable().default(null),
        ceiling: z.number().nullable().default(null),
      })
      .default({}),
    glicko2: z
      .object({
        initialRd: z.number().positive().default(350),
        initialVolatility: z.number().positive().default(0.06),
        /** Constrains volatility change. Glickman suggests 0.3–1.2. */
        tau: z.number().positive().default(0.5),
      })
      .default({}),
    trueskill: z
      .object({
        mu: z.number().default(25),
        sigma: z.number().positive().default(25 / 3),
        beta: z.number().positive().default(25 / 6),
        tau: z.number().positive().default(25 / 300),
        drawProbability: z.number().min(0).max(1).default(0.1),
      })
      .default({}),
    /** Whether the displayed rating is the entrant's starting one plus this event, or this event alone. */
    carryOver: z.boolean().default(true),
  })
  .default({});

/* ────────────────────────────────────────────────────────────────────────────
 * Scheduling
 * ──────────────────────────────────────────────────────────────────────────── */

export const venueSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Matches this venue can host at the same time. A pétanque piste hosts one. */
  capacity: z.number().int().min(1).default(1),
});

export const scheduleConfigSchema = z
  .object({
    /** ISO date-time the first round starts. null leaves fixtures undated. */
    startsAt: z.string().nullable().default(null),
    matchDurationMinutes: z.number().int().positive().default(45),
    /** Gap between the end of one round and the start of the next. */
    breakBetweenRoundsMinutes: z.number().int().min(0).default(15),
    venues: z.array(venueSchema).default([]),
    /** Cap on simultaneous matches. null derives it from venue capacity. */
    concurrentMatches: z.number().int().positive().nullable().default(null),
    timezone: z.string().default("UTC"),
  })
  .default({});

/* ────────────────────────────────────────────────────────────────────────────
 * The whole thing
 * ──────────────────────────────────────────────────────────────────────────── */

export const tournamentConfigSchema = z.object({
  entrant: entrantConfigSchema,
  match: matchShapeSchema,
  score: scoreConfigSchema,
  standings: standingsConfigSchema,
  pairing: pairingConfigSchema,
  rating: ratingConfigSchema,
  schedule: scheduleConfigSchema,
  /** Stages run in order; each feeds its qualifiers to the next. */
  stages: z
    .array(stageConfigSchema)
    .min(1)
    .default([{ kind: "single_elimination", id: "main" }]),
  /** Custom entrant metadata fields the organiser wants to record and filter on. */
  entrantFields: z
    .array(z.object({ key: z.string(), label: z.string(), }))
    .default([]),
});

export type EntrantConfig = z.infer<typeof entrantConfigSchema>;
export type MatchShape = z.infer<typeof matchShapeSchema>;
export type ScoreConfig = z.infer<typeof scoreConfigSchema>;
export type ScoreKind = ScoreConfig["kind"];
export type BonusRule = z.infer<typeof bonusRuleSchema>;
export type PointsSystem = z.infer<typeof pointsSystemSchema>;
export type TiebreakerKey = z.infer<typeof tiebreakerKeySchema>;
export type Tiebreaker = z.infer<typeof tiebreakerSchema>;
export type StandingsConfig = z.infer<typeof standingsConfigSchema>;
export type PairingStrategy = z.infer<typeof pairingStrategySchema>;
export type PairingConstraints = z.infer<typeof pairingConstraintsSchema>;
export type PairingConfig = z.infer<typeof pairingConfigSchema>;
export type Seeding = z.infer<typeof seedingSchema>;
export type Consolation = z.infer<typeof consolationSchema>;
export type Qualification = z.infer<typeof qualificationSchema>;
export type StageConfig = z.infer<typeof stageConfigSchema>;
export type StageKind = StageConfig["kind"];
export type RatingConfig = z.infer<typeof ratingConfigSchema>;
export type Venue = z.infer<typeof venueSchema>;
export type ScheduleConfig = z.infer<typeof scheduleConfigSchema>;
export type TournamentConfig = z.infer<typeof tournamentConfigSchema>;
export type TournamentConfigInput = z.input<typeof tournamentConfigSchema>;

/** Apply defaults and validate. Throws a ZodError describing what is wrong. */
export function parseConfig(input: unknown): TournamentConfig {
  return tournamentConfigSchema.parse(input ?? {});
}

/** Non-throwing variant, for live validation in the config editor. */
export function safeParseConfig(input: unknown) {
  return tournamentConfigSchema.safeParse(input ?? {});
}
