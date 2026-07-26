/**
 * Sports, as shortcuts.
 *
 * These are *not* a second concept. The engine has no idea any of them exist,
 * and every one is a shape from `examples.ts` with the scoring and tiebreaks
 * filled in — which is the point worth making rather than hiding. Each names the
 * shape it is built on, so picking "Rugby" and picking "Everyone plays everyone"
 * and setting the points yourself land in exactly the same place.
 *
 * The list exists because typing in a points system from memory is a chore, not
 * because the software needs to know what a scrum is. Anything here can be
 * edited afterwards, and a sport that is missing is a few settings away.
 */

import type { TournamentConfigInput } from "@bracketeer/engine";

export interface SportPreset {
  id: string;
  name: string;
  /** The generic shape this is, so the relationship stays visible. */
  basedOn: string;
  /** The settings this fills in on top of that shape. */
  fills: string;
  config: TournamentConfigInput;
}

const AFFILIATION = [{ key: "affiliation", label: "Club or team" }];

/** A league table with the given points and the usual separators. */
const table = (win: number, draw: number, loss = 0) => ({
  pointsSystem: { win, draw, loss },
  tiebreakers: [
    { key: "points" as const },
    { key: "point_diff" as const },
    { key: "points_for" as const },
    { key: "head_to_head" as const },
  ],
});

export const SPORTS: SportPreset[] = [
  /* ── Counted score, drawn games possible ────────────────────────────────── */
  {
    id: "football",
    name: "Football",
    basedOn: "A season, home and away",
    fills: "goals · 3–1–0 · goal difference · 90 minutes",
    config: {
      entrant: { kind: "fixed_team" },
      match: { hasHomeSide: true },
      score: { kind: "points", allowDraw: true },
      standings: table(3, 1),
      rating: { system: "none" },
      schedule: { matchDurationMinutes: 105, breakBetweenRoundsMinutes: 0 },
      stages: [{ kind: "round_robin", id: "season", name: "Season", legs: 2 }],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "handball",
    name: "Handball",
    basedOn: "A season, home and away",
    fills: "goals · 2–1–0 · goal difference",
    config: {
      entrant: { kind: "fixed_team" },
      match: { hasHomeSide: true },
      score: { kind: "points", allowDraw: true },
      standings: table(2, 1),
      rating: { system: "none" },
      schedule: { matchDurationMinutes: 60 },
      stages: [{ kind: "round_robin", id: "season", name: "Season", legs: 2 }],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "rugby",
    name: "Rugby union",
    basedOn: "A season, home and away",
    fills: "4–2–0 · try bonus at four · losing bonus within seven",
    config: {
      entrant: { kind: "fixed_team" },
      match: { hasHomeSide: true },
      score: { kind: "points", allowDraw: true },
      standings: {
        pointsSystem: {
          win: 4,
          draw: 2,
          loss: 0,
          // The standard system since the 1996 Super 12, and now near-universal.
          bonusRules: [
            {
              id: "attacking",
              label: "Four tries or more",
              // Tries are not recorded separately, so this stands in: a side
              // that scores four tries has almost always passed twenty points.
              condition: { kind: "points_for_at_least", value: 20 },
              points: 1,
            },
            {
              id: "losing",
              label: "Lost by seven or fewer",
              condition: { kind: "loss_margin_at_most", value: 7 },
              points: 1,
            },
          ],
        },
        tiebreakers: [
          { key: "points" },
          { key: "point_diff" },
          { key: "points_for" },
          { key: "head_to_head" },
        ],
      },
      rating: { system: "none" },
      schedule: { matchDurationMinutes: 100 },
      stages: [{ kind: "round_robin", id: "season", name: "Season", legs: 2 }],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "basketball",
    name: "Basketball",
    basedOn: "A season, home and away",
    fills: "points · no draws · 2–0 · points difference",
    config: {
      entrant: { kind: "fixed_team" },
      match: { hasHomeSide: true },
      score: { kind: "points", allowDraw: false },
      standings: table(2, 0),
      rating: { system: "none" },
      schedule: { matchDurationMinutes: 120 },
      stages: [{ kind: "round_robin", id: "season", name: "Season", legs: 2 }],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "ice-hockey",
    name: "Ice hockey",
    basedOn: "A season, home and away",
    fills: "goals · 3–2–1–0 with overtime",
    config: {
      entrant: { kind: "fixed_team" },
      match: { hasHomeSide: true },
      score: { kind: "points" },
      standings: {
        // Three for a win in regulation, two if it went to overtime, and one for
        // losing there — so reaching overtime is worth something to both.
        pointsSystem: { win: 3, loss: 0, overtimeWin: 2, overtimeLoss: 1, draw: 1 },
        tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "points_for" }],
      },
      rating: { system: "none" },
      schedule: { matchDurationMinutes: 150 },
      stages: [{ kind: "round_robin", id: "season", name: "Season", legs: 2 }],
      entrantFields: AFFILIATION,
    },
  },

  /* ── First to a target ──────────────────────────────────────────────────── */
  {
    id: "petanque",
    name: "Pétanque",
    basedOn: "Pools, then a knockout with a second draw",
    fills: "doublettes · games to 13 · consolante",
    config: {
      entrant: { kind: "fixed_team", teamSize: 2 },
      score: { kind: "points", target: 13 },
      standings: {
        pointsSystem: { win: 1, draw: 0, loss: 0, bye: 1 },
        tiebreakers: [{ key: "wins" }, { key: "point_diff" }, { key: "drawn_lot" }],
      },
      rating: { system: "elo", initial: 1000 },
      stages: [
        {
          kind: "groups",
          id: "pools",
          name: "Pools",
          groupSize: 4,
          distribution: "random",
          inner: { kind: "double_elimination", playGrandFinal: false },
          qualification: { perGroup: 2 },
        },
        {
          kind: "single_elimination",
          id: "main-draw",
          name: "Main draw",
          consolation: "full_consolation",
        },
      ],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "darts",
    name: "Darts",
    basedOn: "Straight knockout",
    fills: "best of five legs · knockout",
    config: {
      score: { kind: "sets", bestOf: 5 },
      stages: [{ kind: "single_elimination", id: "main", name: "Main draw" }],
      rating: { system: "elo", initial: 1000 },
      entrantFields: AFFILIATION,
    },
  },

  /* ── Decided by sets ────────────────────────────────────────────────────── */
  {
    id: "tennis",
    name: "Tennis",
    basedOn: "Straight knockout",
    fills: "best of three sets to six · win by two",
    config: {
      score: { kind: "sets", bestOf: 3, setTarget: 6, setWinBy: 2, decidingSetTarget: 10 },
      stages: [
        { kind: "single_elimination", id: "main", name: "Main draw", consolation: "third_place" },
      ],
      rating: { system: "elo", initial: 1200, elo: { k: 32 } },
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "padel",
    name: "Padel",
    basedOn: "Straight knockout",
    fills: "pairs · best of three sets to six",
    config: {
      entrant: { kind: "fixed_team", teamSize: 2 },
      score: { kind: "sets", bestOf: 3, setTarget: 6, setWinBy: 2 },
      stages: [
        { kind: "single_elimination", id: "main", name: "Main draw", consolation: "full_consolation" },
      ],
      rating: { system: "elo", initial: 1000 },
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "volleyball",
    name: "Volleyball",
    basedOn: "Everyone plays everyone",
    fills: "best of five sets to 25 · win by two",
    config: {
      entrant: { kind: "fixed_team" },
      score: { kind: "sets", bestOf: 5, setTarget: 25, setWinBy: 2, decidingSetTarget: 15 },
      standings: {
        pointsSystem: { win: 3, draw: 0, loss: 0 },
        tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "head_to_head" }],
      },
      rating: { system: "none" },
      stages: [{ kind: "round_robin", id: "table", name: "Table" }],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "badminton",
    name: "Badminton",
    basedOn: "Straight knockout",
    fills: "best of three games to 21 · win by two",
    config: {
      score: { kind: "sets", bestOf: 3, setTarget: 21, setWinBy: 2 },
      stages: [
        { kind: "single_elimination", id: "main", name: "Main draw", consolation: "full_consolation" },
      ],
      rating: { system: "elo", initial: 1000 },
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "table-tennis",
    name: "Table tennis",
    basedOn: "Groups, then a knockout",
    fills: "best of five games to 11 · win by two",
    config: {
      score: { kind: "sets", bestOf: 5, setTarget: 11, setWinBy: 2 },
      standings: {
        pointsSystem: { win: 2, draw: 0, loss: 1 },
        tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "head_to_head" }],
      },
      rating: { system: "elo", initial: 1000 },
      stages: [
        {
          kind: "groups",
          id: "groups",
          name: "Groups",
          groupSize: 4,
          inner: { kind: "round_robin" },
          qualification: { perGroup: 2 },
        },
        { kind: "single_elimination", id: "knockout", name: "Knockout" },
      ],
      entrantFields: AFFILIATION,
    },
  },

  /* ── Only the verdict ───────────────────────────────────────────────────── */
  {
    id: "chess",
    name: "Chess",
    basedOn: "Paired by record",
    fills: "win, draw or loss · Buchholz and Sonneborn-Berger · Glicko-2",
    config: {
      score: { kind: "outcome", allowDraw: true },
      pairing: {
        strategy: "closest_record",
        constraints: { avoidSameMeta: { enabled: true, field: "affiliation" } },
      },
      standings: {
        pointsSystem: { win: 1, draw: 0.5, loss: 0, bye: 1 },
        tiebreakers: [
          { key: "points" },
          { key: "buchholz" },
          { key: "sonneborn_berger" },
          { key: "drawn_lot" },
        ],
      },
      rating: { system: "glicko2", initial: 1500 },
      stages: [{ kind: "swiss", id: "rounds", name: "Rounds" }],
      entrantFields: AFFILIATION,
    },
  },

  /* ── Video games ────────────────────────────────────────────────────────── */
  {
    id: "fighting-game",
    name: "Fighting game",
    basedOn: "Two lives",
    fills: "best of five · double elimination · grand final reset",
    config: {
      score: { kind: "sets", bestOf: 5 },
      pairing: { strategy: "seeded" },
      rating: { system: "elo", initial: 1200, elo: { k: 32 } },
      stages: [
        {
          kind: "double_elimination",
          id: "main",
          name: "Main event",
          grandFinalReset: true,
        },
      ],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "team-shooter",
    name: "Team shooter or MOBA",
    basedOn: "Groups, then two lives",
    fills: "teams · best of three maps · groups into a knockout",
    config: {
      entrant: { kind: "fixed_team", teamSize: 5 },
      score: { kind: "sets", bestOf: 3 },
      standings: {
        pointsSystem: { win: 1, draw: 0, loss: 0 },
        tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "head_to_head" }],
      },
      rating: { system: "elo", initial: 1200 },
      stages: [
        {
          kind: "groups",
          id: "groups",
          name: "Groups",
          groupSize: 4,
          inner: { kind: "round_robin" },
          qualification: { perGroup: 2 },
        },
        { kind: "double_elimination", id: "playoffs", name: "Playoffs" },
      ],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "racing-game",
    name: "Racing or party game",
    basedOn: "Heats of four",
    fills: "four per race · points by finishing place",
    config: {
      match: { sidesPerMatch: 4 },
      score: { kind: "placement", pointsByPlace: [15, 12, 10, 8] },
      pairing: { strategy: "closest_rating" },
      standings: {
        pointsSource: "score",
        tiebreakers: [{ key: "points" }, { key: "wins" }, { key: "drawn_lot" }],
      },
      rating: { system: "trueskill" },
      stages: [{ kind: "swiss", id: "heats", name: "Heats", rounds: 6 }],
    },
  },
  {
    id: "battle-royale",
    name: "Battle royale",
    basedOn: "Heats of four",
    fills: "sixteen per match · points by placement",
    config: {
      match: { sidesPerMatch: 16 },
      score: {
        kind: "placement",
        pointsByPlace: [12, 9, 7, 5, 4, 3, 3, 2, 2, 2, 1, 1, 1, 0, 0, 0],
      },
      pairing: { strategy: "random" },
      standings: {
        pointsSource: "score",
        tiebreakers: [{ key: "points" }, { key: "wins" }, { key: "drawn_lot" }],
      },
      rating: { system: "trueskill" },
      stages: [{ kind: "swiss", id: "matches", name: "Matches", rounds: 6 }],
    },
  },

  /* ── Against the clock ──────────────────────────────────────────────────── */
  {
    id: "athletics",
    name: "Running or swimming",
    basedOn: "Against the clock",
    fills: "eight lanes · fastest time · did-not-finish recorded",
    config: {
      match: { sidesPerMatch: 8 },
      score: { kind: "time", lowerIsBetter: true },
      pairing: { strategy: "closest_rating" },
      standings: { tiebreakers: [{ key: "wins" }, { key: "drawn_lot" }] },
      stages: [{ kind: "swiss", id: "heats", name: "Heats", rounds: 3 }],
      entrantFields: AFFILIATION,
    },
  },

  /* ── Finals with a top-two advantage ────────────────────────────────────── */
  {
    id: "curling",
    name: "Curling or cricket finals",
    basedOn: "Four-way finish",
    fills: "top four · the top two get a second chance",
    config: {
      entrant: { kind: "fixed_team" },
      score: { kind: "points" },
      stages: [{ kind: "page_playoff", id: "playoff", name: "Playoff" }],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "bowling",
    name: "Bowling finals",
    basedOn: "Climb to the top seed",
    fills: "five qualifiers · the leader plays once",
    config: {
      score: { kind: "points" },
      stages: [{ kind: "stepladder", id: "finals", name: "Finals", rungs: 5 }],
      entrantFields: AFFILIATION,
    },
  },
];

export function findSport(id: string): SportPreset | undefined {
  return SPORTS.find((sport) => sport.id === id);
}
