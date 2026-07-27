/**
 * Sports, as shortcuts.
 *
 * These are *not* a second concept. The engine has no idea any of them exist,
 * and every format below is a shape from `examples.ts` with the scoring and
 * tiebreaks filled in — which is the point worth making rather than hiding.
 * Each names the shape it is built on, so picking a sport and picking that shape
 * and setting the points yourself land in exactly the same place.
 *
 * A sport has *formats*, not one setting. The same game is run completely
 * differently depending on the day: a league runs for a season, a cup is over in
 * an afternoon, and a club night is neither. Offering one arrangement per sport
 * would be the same mistake as offering one sport per shape.
 */

import type { TournamentConfigInput } from "@bracketeer/engine";

export interface SportFormat {
  id: string;
  name: string;
  /** The generic shape this is, so the relationship stays visible. */
  basedOn: string;
  /** What this fills in on top of that shape. */
  fills: string;
  config: TournamentConfigInput;
}

export interface Sport {
  id: string;
  name: string;
  /** What the scoring and the rules have in common across its formats. */
  note: string;
  formats: SportFormat[];
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

/** Knockout ranking: wins first, then how you did it. */
const knockoutTable = {
  pointsSystem: { win: 1, draw: 0, loss: 0, bye: 1 },
  tiebreakers: [
    { key: "wins" as const },
    { key: "point_diff" as const },
    { key: "drawn_lot" as const },
  ],
};

export const SPORTS: Sport[] = [
  /* ────────────────────────────────────────────────────────────────────────
   * Pétanque
   * ──────────────────────────────────────────────────────────────────────── */
  {
    id: "petanque",
    name: "Pétanque",
    note: "Games to 13. Teams are tête-à-tête (one), doublette (two, three boules each) or triplette (three, two boules each). A concours nearly always runs a consolante so nobody drives home after one game.",
    formats: [
      {
        id: "petanque-poules",
        name: "Concours en poules — doublettes",
        basedOn: "Pools, then a knockout with a second draw",
        fills: "pairs · to 13 · pools of four · consolante",
        config: {
          entrant: { kind: "fixed_team", teamSize: 2 },
          score: { kind: "points", target: 13 },
          standings: knockoutTable,
          rating: { system: "elo", initial: 1000 },
          stages: [
            {
              kind: "groups",
              id: "pools",
              name: "Poules",
              groupSize: 4,
              distribution: "random",
              // Winners, losers, barrage. Both survivors qualify, so no final.
              inner: { kind: "double_elimination", playGrandFinal: false },
              qualification: { perGroup: 2 },
            },
            {
              kind: "single_elimination",
              id: "principal",
              name: "Principal",
              consolation: "full_consolation",
            },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "petanque-directe",
        name: "Élimination directe — doublettes",
        basedOn: "Knockout with a second draw",
        fills: "pairs · to 13 · straight knockout · consolante",
        config: {
          entrant: { kind: "fixed_team", teamSize: 2 },
          score: { kind: "points", target: 13 },
          standings: knockoutTable,
          rating: { system: "elo", initial: 1000 },
          stages: [
            {
              kind: "single_elimination",
              id: "principal",
              name: "Principal",
              seeding: { method: "random" },
              consolation: "full_consolation",
            },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "petanque-triplette",
        name: "Triplettes",
        basedOn: "Pools, then a knockout with a second draw",
        fills: "teams of three · to 13 · pools · consolante",
        config: {
          entrant: { kind: "fixed_team", teamSize: 3 },
          score: { kind: "points", target: 13 },
          standings: knockoutTable,
          rating: { system: "elo", initial: 1000 },
          stages: [
            {
              kind: "groups",
              id: "pools",
              name: "Poules",
              groupSize: 4,
              distribution: "random",
              inner: { kind: "double_elimination", playGrandFinal: false },
              qualification: { perGroup: 2 },
            },
            {
              kind: "single_elimination",
              id: "principal",
              name: "Principal",
              consolation: "full_consolation",
            },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "petanque-tete-a-tete",
        name: "Tête-à-tête",
        basedOn: "Paired by record",
        fills: "one against one · to 13 · nobody eliminated",
        config: {
          score: { kind: "points", target: 13 },
          pairing: { strategy: "closest_record" },
          standings: {
            pointsSystem: { win: 1, draw: 0, loss: 0, bye: 1 },
            tiebreakers: [
              { key: "wins" },
              { key: "buchholz" },
              { key: "point_diff" },
              { key: "drawn_lot" },
            ],
          },
          rating: { system: "elo", initial: 1000 },
          stages: [{ kind: "swiss", id: "parties", name: "Parties" }],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "petanque-melee",
        name: "Mêlée — partners drawn each round",
        basedOn: "Rotating partners",
        fills: "enter alone · new partner each round · individual ranking",
        config: {
          entrant: { kind: "drawn_team", teamSize: 2, redrawEachRound: true },
          score: { kind: "points", target: 13 },
          pairing: { strategy: "closest_record" },
          standings: {
            pointsSource: "score",
            tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "drawn_lot" }],
          },
          rating: { system: "elo", initial: 1000 },
          stages: [{ kind: "swiss", id: "parties", name: "Parties", rounds: 5 }],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────────────────
   * Football
   * ──────────────────────────────────────────────────────────────────────── */
  {
    id: "football",
    name: "Football",
    note: "Goals, draws allowed, three points for a win since the 1990s. Separated by goal difference and then goals scored.",
    formats: [
      {
        id: "football-season",
        name: "League season",
        basedOn: "A season, home and away",
        fills: "home and away · 3–1–0 · goal difference",
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
        id: "football-cup",
        name: "Cup",
        basedOn: "Straight knockout",
        fills: "one leg · no draws · random draw each round",
        config: {
          entrant: { kind: "fixed_team" },
          score: { kind: "points", allowDraw: false },
          standings: knockoutTable,
          rating: { system: "none" },
          schedule: { matchDurationMinutes: 105 },
          stages: [
            {
              kind: "single_elimination",
              id: "cup",
              name: "Cup",
              seeding: { method: "random" },
              consolation: "none",
            },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "football-tournament",
        name: "Tournament — groups then a knockout",
        basedOn: "Groups, then a knockout",
        fills: "groups of four · top two advance · third-place play-off",
        config: {
          entrant: { kind: "fixed_team" },
          score: { kind: "points", allowDraw: true },
          standings: table(3, 1),
          rating: { system: "none" },
          schedule: { matchDurationMinutes: 105 },
          stages: [
            {
              kind: "groups",
              id: "groups",
              name: "Groups",
              groupSize: 4,
              inner: { kind: "round_robin" },
              qualification: { perGroup: 2 },
            },
            {
              kind: "single_elimination",
              id: "knockout",
              name: "Knockout",
              consolation: "third_place",
            },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "football-five-a-side",
        name: "Five-a-side evening",
        basedOn: "Everyone plays everyone",
        fills: "one short league · everyone plays everyone once",
        config: {
          entrant: { kind: "fixed_team", teamSize: 5 },
          score: { kind: "points", allowDraw: true },
          standings: table(3, 1),
          rating: { system: "none" },
          schedule: { matchDurationMinutes: 20, breakBetweenRoundsMinutes: 5 },
          stages: [{ kind: "round_robin", id: "table", name: "Table" }],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────────────────
   * Other team sports
   * ──────────────────────────────────────────────────────────────────────── */
  {
    id: "rugby",
    name: "Rugby union",
    note: "Four points for a win, two for a draw, plus a bonus for scoring four tries and another for losing by seven or fewer — the system in use since the 1996 Super 12.",
    formats: [
      {
        id: "rugby-season",
        name: "League season",
        basedOn: "A season, home and away",
        fills: "home and away · 4–2–0 · try and losing bonuses",
        config: {
          entrant: { kind: "fixed_team" },
          match: { hasHomeSide: true },
          score: { kind: "points", allowDraw: true },
          standings: {
            pointsSystem: {
              win: 4,
              draw: 2,
              loss: 0,
              bonusRules: [
                {
                  id: "attacking",
                  label: "Four tries or more",
                  // Tries are not recorded separately, so this stands in: a side
                  // scoring four tries has almost always passed twenty points.
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
        id: "rugby-sevens",
        name: "Sevens tournament",
        basedOn: "Groups, then a knockout",
        fills: "groups in the morning · knockout in the afternoon · plate for the rest",
        config: {
          entrant: { kind: "fixed_team", teamSize: 7 },
          score: { kind: "points", allowDraw: true },
          standings: table(3, 2, 1),
          rating: { system: "none" },
          schedule: { matchDurationMinutes: 20, breakBetweenRoundsMinutes: 10 },
          stages: [
            {
              kind: "groups",
              id: "pools",
              name: "Pools",
              groupSize: 4,
              inner: { kind: "round_robin" },
              qualification: { perGroup: 2 },
            },
            {
              kind: "single_elimination",
              id: "cup",
              name: "Cup",
              consolation: "full_consolation",
            },
          ],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },
  {
    id: "basketball",
    name: "Basketball",
    note: "Points, and no draws — a tied game goes to overtime until somebody is ahead.",
    formats: [
      {
        id: "basketball-season",
        name: "League season",
        basedOn: "A season, home and away",
        fills: "home and away · 2–0 · points difference",
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
        id: "basketball-playoffs",
        name: "Play-offs",
        basedOn: "Two lives",
        fills: "no draws · everybody gets a second life",
        config: {
          entrant: { kind: "fixed_team" },
          score: { kind: "points", allowDraw: false },
          standings: knockoutTable,
          rating: { system: "none" },
          stages: [
            { kind: "double_elimination", id: "playoffs", name: "Play-offs", grandFinalReset: true },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "basketball-3x3",
        name: "Three-a-side day",
        basedOn: "Groups, then a knockout",
        fills: "teams of three · short games · groups into a knockout",
        config: {
          entrant: { kind: "fixed_team", teamSize: 3 },
          score: { kind: "points", target: 21, allowDraw: false },
          standings: table(2, 0),
          rating: { system: "none" },
          schedule: { matchDurationMinutes: 15, breakBetweenRoundsMinutes: 5 },
          stages: [
            {
              kind: "groups",
              id: "pools",
              name: "Pools",
              groupSize: 4,
              inner: { kind: "round_robin" },
              qualification: { perGroup: 2 },
            },
            { kind: "single_elimination", id: "knockout", name: "Knockout" },
          ],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },
  {
    id: "handball",
    name: "Handball",
    note: "Goals, draws allowed, two points for a win in most European leagues.",
    formats: [
      {
        id: "handball-season",
        name: "League season",
        basedOn: "A season, home and away",
        fills: "home and away · 2–1–0 · goal difference",
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
        id: "handball-tournament",
        name: "Tournament",
        basedOn: "Groups, then a knockout",
        fills: "groups · top two advance · third-place play-off",
        config: {
          entrant: { kind: "fixed_team" },
          score: { kind: "points", allowDraw: true },
          standings: table(2, 1),
          rating: { system: "none" },
          stages: [
            {
              kind: "groups",
              id: "groups",
              name: "Groups",
              groupSize: 4,
              inner: { kind: "round_robin" },
              qualification: { perGroup: 2 },
            },
            {
              kind: "single_elimination",
              id: "knockout",
              name: "Knockout",
              consolation: "third_place",
            },
          ],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },
  {
    id: "ice-hockey",
    name: "Ice hockey",
    note: "Three points for winning in regulation, two for winning in overtime and one for losing there — so reaching overtime is worth something to both sides.",
    formats: [
      {
        id: "ice-hockey-season",
        name: "League season",
        basedOn: "A season, home and away",
        fills: "home and away · 3–2–1–0 with overtime",
        config: {
          entrant: { kind: "fixed_team" },
          match: { hasHomeSide: true },
          score: { kind: "points" },
          standings: {
            pointsSystem: { win: 3, loss: 0, draw: 1, overtimeWin: 2, overtimeLoss: 1 },
            tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "points_for" }],
          },
          rating: { system: "none" },
          schedule: { matchDurationMinutes: 150 },
          stages: [{ kind: "round_robin", id: "season", name: "Season", legs: 2 }],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "ice-hockey-playoffs",
        name: "Play-offs",
        basedOn: "Straight knockout",
        fills: "no draws · seeded knockout",
        config: {
          entrant: { kind: "fixed_team" },
          score: { kind: "points", allowDraw: false },
          standings: knockoutTable,
          rating: { system: "none" },
          stages: [{ kind: "single_elimination", id: "playoffs", name: "Play-offs" }],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────────────────
   * Racket and target games
   * ──────────────────────────────────────────────────────────────────────── */
  {
    id: "tennis",
    name: "Tennis",
    note: "Best of three sets to six games, won by two, with a tiebreak deciding a level set.",
    formats: [
      {
        id: "tennis-draw",
        name: "Singles draw",
        basedOn: "Straight knockout",
        fills: "best of three sets to six · third-place play-off",
        config: {
          score: { kind: "sets", bestOf: 3, setTarget: 6, setWinBy: 2, decidingSetTarget: 10 },
          standings: knockoutTable,
          rating: { system: "elo", initial: 1200, elo: { k: 32 } },
          stages: [
            { kind: "single_elimination", id: "draw", name: "Draw", consolation: "third_place" },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "tennis-club-ladder",
        name: "Club ladder",
        basedOn: "Challenge ladder",
        fills: "challenge up to three places above you · no end date",
        config: {
          score: { kind: "sets", bestOf: 3, setTarget: 6, setWinBy: 2 },
          rating: { system: "elo", initial: 1200 },
          stages: [
            { kind: "ladder", id: "ladder", name: "Ladder", challengeRange: 3, takeRungOnWin: true },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "tennis-box-league",
        name: "Box league",
        basedOn: "Everyone plays everyone",
        fills: "small group · everyone plays everyone once",
        config: {
          score: { kind: "sets", bestOf: 3, setTarget: 6, setWinBy: 2 },
          standings: {
            pointsSystem: { win: 2, draw: 0, loss: 0 },
            tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "head_to_head" }],
          },
          rating: { system: "elo", initial: 1200 },
          stages: [{ kind: "round_robin", id: "box", name: "Box" }],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },
  {
    id: "padel",
    name: "Padel",
    note: "Always in pairs, scored like tennis. A club americano redraws partners every round and ranks individuals.",
    formats: [
      {
        id: "padel-draw",
        name: "Pairs draw",
        basedOn: "Knockout with a second draw",
        fills: "pairs · best of three sets · second draw for early losers",
        config: {
          entrant: { kind: "fixed_team", teamSize: 2 },
          score: { kind: "sets", bestOf: 3, setTarget: 6, setWinBy: 2 },
          standings: knockoutTable,
          rating: { system: "elo", initial: 1000 },
          stages: [
            {
              kind: "single_elimination",
              id: "draw",
              name: "Draw",
              consolation: "full_consolation",
            },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "padel-americano",
        name: "Americano",
        basedOn: "Rotating partners",
        fills: "enter alone · new partner each round · points are individual",
        config: {
          entrant: { kind: "drawn_team", teamSize: 2, redrawEachRound: true },
          score: { kind: "points", target: 24 },
          pairing: { strategy: "closest_record" },
          standings: {
            pointsSource: "score",
            tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "drawn_lot" }],
          },
          rating: { system: "elo", initial: 1000 },
          stages: [{ kind: "swiss", id: "rounds", name: "Rounds", rounds: 7 }],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },
  {
    id: "badminton",
    name: "Badminton",
    note: "Best of three games to 21, won by two.",
    formats: [
      {
        id: "badminton-draw",
        name: "Singles draw",
        basedOn: "Knockout with a second draw",
        fills: "best of three to 21 · second draw for early losers",
        config: {
          score: { kind: "sets", bestOf: 3, setTarget: 21, setWinBy: 2 },
          standings: knockoutTable,
          rating: { system: "elo", initial: 1000 },
          stages: [
            {
              kind: "single_elimination",
              id: "draw",
              name: "Draw",
              consolation: "full_consolation",
            },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "badminton-groups",
        name: "Groups then a knockout",
        basedOn: "Groups, then a knockout",
        fills: "three matches guaranteed · top two advance",
        config: {
          score: { kind: "sets", bestOf: 3, setTarget: 21, setWinBy: 2 },
          standings: {
            pointsSystem: { win: 2, draw: 0, loss: 0 },
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
    ],
  },
  {
    id: "table-tennis",
    name: "Table tennis",
    note: "Best of five games to 11, won by two.",
    formats: [
      {
        id: "table-tennis-groups",
        name: "Groups then a knockout",
        basedOn: "Groups, then a knockout",
        fills: "best of five to 11 · top two advance",
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
      {
        id: "table-tennis-ladder",
        name: "Club ladder",
        basedOn: "Challenge ladder",
        fills: "challenge upwards · runs all season",
        config: {
          score: { kind: "sets", bestOf: 5, setTarget: 11, setWinBy: 2 },
          rating: { system: "elo", initial: 1000 },
          stages: [
            { kind: "ladder", id: "ladder", name: "Ladder", challengeRange: 3, takeRungOnWin: true },
          ],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },
  {
    id: "volleyball",
    name: "Volleyball",
    note: "Best of five sets to 25, won by two, with a shorter deciding set.",
    formats: [
      {
        id: "volleyball-league",
        name: "League",
        basedOn: "Everyone plays everyone",
        fills: "best of five to 25 · everyone plays everyone",
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
        id: "volleyball-tournament",
        name: "Weekend tournament",
        basedOn: "Groups, then a knockout",
        fills: "shorter sets · pools then a knockout",
        config: {
          entrant: { kind: "fixed_team" },
          score: { kind: "sets", bestOf: 3, setTarget: 21, setWinBy: 2 },
          standings: {
            pointsSystem: { win: 2, draw: 0, loss: 0 },
            tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "head_to_head" }],
          },
          rating: { system: "none" },
          stages: [
            {
              kind: "groups",
              id: "pools",
              name: "Pools",
              groupSize: 4,
              inner: { kind: "round_robin" },
              qualification: { perGroup: 2 },
            },
            {
              kind: "single_elimination",
              id: "knockout",
              name: "Knockout",
              consolation: "third_place",
            },
          ],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },
  {
    id: "darts",
    name: "Darts",
    note: "Legs and sets. A knockout for a night, a league for a season.",
    formats: [
      {
        id: "darts-knockout",
        name: "Knockout night",
        basedOn: "Straight knockout",
        fills: "best of five legs · seeded knockout",
        config: {
          score: { kind: "sets", bestOf: 5 },
          standings: knockoutTable,
          rating: { system: "elo", initial: 1000 },
          stages: [{ kind: "single_elimination", id: "draw", name: "Draw" }],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "darts-league",
        name: "League",
        basedOn: "A season, home and away",
        fills: "best of five legs · home and away · 2–0",
        config: {
          match: { hasHomeSide: true },
          score: { kind: "sets", bestOf: 5 },
          standings: table(2, 0),
          rating: { system: "elo", initial: 1000 },
          stages: [{ kind: "round_robin", id: "season", name: "Season", legs: 2 }],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────────────────
   * Board and mind games
   * ──────────────────────────────────────────────────────────────────────── */
  {
    id: "chess",
    name: "Chess",
    note: "A win is one point, a draw a half. Ties are broken by the strength of the opposition, because in a Swiss two players on the same score have not played the same tournament.",
    formats: [
      {
        id: "chess-swiss",
        name: "Swiss",
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
      {
        id: "chess-open",
        name: "Large open",
        basedOn: "Paired by record, wide field",
        fills: "head start by rating · accelerated opening rounds",
        config: {
          score: { kind: "outcome", allowDraw: true },
          pairing: { strategy: "closest_record" },
          standings: {
            initialScore: { source: "rating_band", bandSize: 200, maxBonus: 3 },
            pointsSystem: { win: 1, draw: 0.5, loss: 0, bye: 1 },
            tiebreakers: [{ key: "points" }, { key: "buchholz" }, { key: "drawn_lot" }],
          },
          rating: { system: "glicko2", initial: 1500 },
          stages: [
            { kind: "swiss", id: "rounds", name: "Rounds", accelerated: { rounds: 2, bonus: 1 } },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "chess-round-robin",
        name: "Round robin",
        basedOn: "Everyone plays everyone",
        fills: "small invited field · everyone plays everyone",
        config: {
          score: { kind: "outcome", allowDraw: true },
          standings: {
            pointsSystem: { win: 1, draw: 0.5, loss: 0 },
            tiebreakers: [{ key: "points" }, { key: "sonneborn_berger" }, { key: "head_to_head" }],
          },
          rating: { system: "glicko2", initial: 1500 },
          stages: [{ kind: "round_robin", id: "tournament", name: "Tournament" }],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },

  /* ────────────────────────────────────────────────────────────────────────
   * Video games
   * ──────────────────────────────────────────────────────────────────────── */
  {
    id: "fighting-game",
    name: "Fighting game",
    note: "Double elimination is the standard, and the entrant who has never lost has to be beaten twice.",
    formats: [
      {
        id: "fighting-game-bracket",
        name: "Double elimination bracket",
        basedOn: "Two lives",
        fills: "best of five · grand final reset",
        config: {
          score: { kind: "sets", bestOf: 5 },
          pairing: { strategy: "seeded" },
          standings: knockoutTable,
          rating: { system: "elo", initial: 1200, elo: { k: 32 } },
          stages: [
            { kind: "double_elimination", id: "main", name: "Main event", grandFinalReset: true },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "fighting-game-pools",
        name: "Pools into a top cut",
        basedOn: "Groups, then two lives",
        fills: "pools first · the survivors play a bracket",
        config: {
          score: { kind: "sets", bestOf: 3 },
          standings: {
            pointsSystem: { win: 1, draw: 0, loss: 0 },
            tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "drawn_lot" }],
          },
          rating: { system: "elo", initial: 1200 },
          stages: [
            {
              kind: "groups",
              id: "pools",
              name: "Pools",
              groupSize: 4,
              inner: { kind: "round_robin" },
              qualification: { perGroup: 2 },
            },
            { kind: "double_elimination", id: "top-cut", name: "Top cut" },
          ],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },
  {
    id: "team-game",
    name: "Team shooter or MOBA",
    note: "Teams of five, matches decided over several maps.",
    formats: [
      {
        id: "team-game-groups",
        name: "Groups into play-offs",
        basedOn: "Groups, then two lives",
        fills: "teams of five · best of three maps",
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
            { kind: "double_elimination", id: "playoffs", name: "Play-offs" },
          ],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "team-game-league",
        name: "League split",
        basedOn: "A season, home and away",
        fills: "teams of five · every team plays every team twice",
        config: {
          entrant: { kind: "fixed_team", teamSize: 5 },
          score: { kind: "sets", bestOf: 3 },
          standings: table(1, 0),
          rating: { system: "elo", initial: 1200 },
          stages: [{ kind: "round_robin", id: "split", name: "Split", legs: 2 }],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },
  {
    id: "party-game",
    name: "Racing or party game",
    note: "Several play at once and the finishing order is the result, so a points table by place is what ranks the night.",
    formats: [
      {
        id: "party-game-heats",
        name: "Heats of four",
        basedOn: "Heats of four",
        fills: "four per race · 15–12–10–8 by place",
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
        id: "party-game-battle-royale",
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
    ],
  },

  /* ────────────────────────────────────────────────────────────────────────
   * Timed and finals formats
   * ──────────────────────────────────────────────────────────────────────── */
  {
    id: "athletics",
    name: "Running or swimming",
    note: "Heats against the clock. Anyone who does not finish is recorded as such rather than given a time they did not run.",
    formats: [
      {
        id: "athletics-heats",
        name: "Heats",
        basedOn: "Against the clock",
        fills: "eight lanes · fastest wins · did-not-finish recorded",
        config: {
          match: { sidesPerMatch: 8 },
          score: { kind: "time", lowerIsBetter: true },
          pairing: { strategy: "closest_rating" },
          standings: { tiebreakers: [{ key: "wins" }, { key: "drawn_lot" }] },
          stages: [{ kind: "swiss", id: "heats", name: "Heats", rounds: 3 }],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },
  {
    id: "finals",
    name: "Finals days",
    note: "Two ways of finishing a season that reward topping it, rather than treating first and fourth alike.",
    formats: [
      {
        id: "finals-page",
        name: "Four-way finish",
        basedOn: "Four-way finish",
        fills: "top four · the top two get a second chance",
        config: {
          entrant: { kind: "fixed_team" },
          score: { kind: "points" },
          standings: knockoutTable,
          stages: [{ kind: "page_playoff", id: "playoff", name: "Play-off" }],
          entrantFields: AFFILIATION,
        },
      },
      {
        id: "finals-stepladder",
        name: "Stepladder",
        basedOn: "Climb to the top seed",
        fills: "five qualifiers · the leader plays once",
        config: {
          score: { kind: "points" },
          standings: knockoutTable,
          stages: [{ kind: "stepladder", id: "finals", name: "Finals", rungs: 5 }],
          entrantFields: AFFILIATION,
        },
      },
    ],
  },
];

export const ALL_FORMATS: SportFormat[] = SPORTS.flatMap((sport) => sport.formats);

export function findSport(id: string): Sport | undefined {
  return SPORTS.find((sport) => sport.id === id);
}

export function findFormat(id: string): SportFormat | undefined {
  return ALL_FORMATS.find((format) => format.id === id);
}
