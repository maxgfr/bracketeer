/**
 * Starting points.
 *
 * These are named for what they *do*, never for a sport. That is not a stylistic
 * choice — it is the product. A list of sports tells everybody whose game is
 * missing that the app is not for them, and hides the fact that two very
 * different-looking events are usually the same structure with two settings
 * changed. So the question each of these answers is mechanical: does one loss
 * end your day, does everyone play the same number of games, how many are in a
 * match at once.
 *
 * Every one is reachable through the same six axes. None of them is a mode.
 */

import type { TournamentConfigInput } from "@bracketeer/engine";

/** Grouped by the question the organiser is actually asking. */
export type CategoryId =
  | "knockout"
  | "everyone-plays"
  | "two-stage"
  | "many-at-once"
  | "ongoing"
  | "blank";

export interface Category {
  id: CategoryId;
  title: string;
  /** What the whole group has in common, so you can skip four of them at a glance. */
  blurb: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "knockout",
    title: "Losing matters",
    blurb:
      "Short and decisive. The field halves every round, so a large entry finishes quickly — but a bad draw can end somebody's day in twenty minutes unless you give them a second route.",
  },
  {
    id: "everyone-plays",
    title: "Everybody keeps playing",
    blurb:
      "Nobody is knocked out. Every entrant plays the same number of matches, which is what you want when people have travelled, or paid, or only get one evening.",
  },
  {
    id: "two-stage",
    title: "Play a few, then decide",
    blurb:
      "A guaranteed set of matches for everyone, then a decisive finish between whoever came through. The usual shape for a full day.",
  },
  {
    id: "many-at-once",
    title: "More than two at a time",
    blurb:
      "Three or more competitors in the same match, ranked by where they finish rather than who they beat.",
  },
  {
    id: "ongoing",
    title: "No end date",
    blurb: "A standing order that changes as results come in, rather than an event with a winner.",
  },
  { id: "blank", title: "Build your own", blurb: "Start from almost nothing and set every rule yourself." },
];

export interface Example {
  id: string;
  category: CategoryId;
  name: string;
  summary: string;
  /** The mechanical choices that make this what it is. */
  signature: string;
  /** Matches an entrant can expect, so the time cost is visible before choosing. */
  games: string;
  config: TournamentConfigInput;
}

/** A field organisers commonly want kept apart in the draw, named generically. */
const AFFILIATION = [{ key: "affiliation", label: "Club or team" }];

export const EXAMPLES: Example[] = [
  /* ── Losing matters ─────────────────────────────────────────────────────── */
  {
    id: "knockout",
    category: "knockout",
    name: "Straight knockout",
    summary:
      "One defeat and you are out. The quickest way to get from a large entry to a winner, and the harshest: half the field plays once.",
    signature: "single elimination · seeded",
    games: "1 to log₂(n)",
    config: {
      stages: [{ kind: "single_elimination", id: "main", name: "Main draw" }],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "knockout-second-chance",
    category: "knockout",
    name: "Knockout with a second draw",
    summary:
      "A knockout, plus a second bracket for everyone beaten in the first round. Drawing the strongest entrant first no longer ends your day, and there are two things to win.",
    signature: "single elimination · full consolation",
    games: "2 minimum",
    config: {
      stages: [
        {
          kind: "single_elimination",
          id: "main",
          name: "Main draw",
          consolation: "full_consolation",
        },
      ],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "two-lives",
    category: "knockout",
    name: "Two lives",
    summary:
      "Lose once and you drop into the lower half of the draw; lose twice and you are out. The entrant who has never been beaten must be beaten twice to lose the title.",
    signature: "double elimination · grand final reset",
    games: "2 minimum",
    config: {
      stages: [
        { kind: "double_elimination", id: "main", name: "Main draw", grandFinalReset: true },
      ],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "best-of",
    category: "knockout",
    name: "Best of three",
    summary:
      "A knockout where each meeting is decided by sets rather than a single score. Longer matches, and far less likely to turn on one bad passage of play.",
    signature: "single elimination · best of three sets",
    games: "1 to log₂(n), each up to three sets",
    config: {
      score: { kind: "sets", bestOf: 3 },
      stages: [{ kind: "single_elimination", id: "main", name: "Main draw" }],
      rating: { system: "elo", initial: 1200, elo: { k: 32 } },
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "climb",
    category: "knockout",
    name: "Climb to the top seed",
    summary:
      "The lowest qualifier plays the next lowest, and the winner keeps climbing one rung at a time. Finishing top of the earlier stage is worth far more than a bracket makes it: the leader plays once.",
    signature: "stepladder",
    games: "1 for the leader, many for the rest",
    config: {
      stages: [{ kind: "stepladder", id: "finals", name: "Finals" }],
    },
  },
  {
    id: "four-way-finish",
    category: "knockout",
    name: "Four-way finish",
    summary:
      "A finish for the top four that rewards finishing first or second: those two get a second chance, the other two do not. Shorter than a double elimination, kinder than a knockout.",
    signature: "page playoff",
    games: "1 to 3",
    config: {
      stages: [{ kind: "page_playoff", id: "playoff", name: "Playoff" }],
    },
  },

  /* ── Everybody keeps playing ────────────────────────────────────────────── */
  {
    id: "all-play-all",
    category: "everyone-plays",
    name: "Everyone plays everyone",
    summary:
      "Every entrant meets every other exactly once. The fairest possible table and the longest: the number of matches grows with the square of the entry, so it suits a small field.",
    signature: "round robin · one leg",
    games: "n − 1",
    config: {
      score: { kind: "points", allowDraw: true },
      standings: {
        pointsSystem: { win: 3, draw: 1, loss: 0 },
        tiebreakers: [
          { key: "points" },
          { key: "point_diff" },
          { key: "points_for" },
          { key: "head_to_head" },
        ],
      },
      rating: { system: "none" },
      stages: [{ kind: "round_robin", id: "table", name: "Table" }],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "season",
    category: "everyone-plays",
    name: "A season, home and away",
    summary:
      "Everyone meets everyone twice, once on each side. Fixtures carry dates and venues, and the whole calendar exports to any calendar app. Three points for a win, separated by score difference.",
    signature: "round robin · two legs · 3-1-0 · scheduled",
    games: "2(n − 1)",
    config: {
      entrant: { kind: "fixed_team" },
      match: { hasHomeSide: true },
      score: { kind: "points", allowDraw: true },
      standings: {
        pointsSystem: { win: 3, draw: 1, loss: 0 },
        tiebreakers: [
          { key: "points" },
          { key: "point_diff" },
          { key: "points_for" },
          { key: "head_to_head" },
        ],
      },
      rating: { system: "none" },
      schedule: { matchDurationMinutes: 90, breakBetweenRoundsMinutes: 0 },
      stages: [{ kind: "round_robin", id: "season", name: "Season", legs: 2 }],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "paired-by-record",
    category: "everyone-plays",
    name: "Paired by record",
    summary:
      "Only the result is recorded — won, lost or drawn — with a draw worth half. Nobody is eliminated and everyone plays every round, but you are matched against whoever has won as often as you have — so the field sorts itself without meeting everyone. Ties are broken by how hard your draw was, which means narrow losses to the strongest entrants count for more than an easy run.",
    signature: "closest record · result only · Buchholz",
    games: "every round",
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
    id: "wide-field",
    category: "everyone-plays",
    name: "Paired by record, wide field",
    summary:
      "The same, tuned for an entry that spans beginners and the very strong. Entrants start on a score set by their rating, so people meet their own level from the first round instead of the top half spending three rounds beating the bottom half.",
    signature: "closest record · head start by rating · accelerated",
    games: "every round",
    config: {
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

  /* ── Play a few, then decide ────────────────────────────────────────────── */
  {
    id: "groups-then-knockout",
    category: "two-stage",
    name: "Groups, then a knockout",
    summary:
      "The field is split into groups that play everyone-plays-everyone, and the top two from each go through to a knockout. Three matches guaranteed before anything is at stake.",
    signature: "groups → knockout · top two advance",
    games: "3 minimum",
    config: {
      score: { kind: "points", allowDraw: true },
      standings: {
        pointsSystem: { win: 3, draw: 1, loss: 0 },
        tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "points_for" }, { key: "drawn_lot" }],
      },
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
          id: "final-stage",
          name: "Knockout",
          consolation: "third_place",
        },
      ],
      entrantFields: AFFILIATION,
    },
  },
  {
    id: "pools-then-knockout",
    category: "two-stage",
    name: "Pools, then a knockout with a second draw",
    summary:
      "Pools of four decided by a mini two-lives bracket — winners play winners, losers play losers, and one deciding match sends the second qualifier through. Then a knockout, with a second draw alongside it for everyone beaten in its first round. A full day where nobody plays fewer than two.",
    signature: "pools of four → knockout · full consolation",
    games: "2 minimum, 3 for most",
    config: {
      entrant: { kind: "fixed_team", teamSize: 2 },
      standings: {
        pointsSystem: { win: 1, draw: 0, loss: 0, bye: 1 },
        tiebreakers: [{ key: "wins" }, { key: "point_diff" }, { key: "drawn_lot" }],
      },
      stages: [
        {
          kind: "groups",
          id: "pools",
          name: "Pools",
          groupSize: 4,
          distribution: "random",
          // Winners, losers, then the decider. No final: both survivors go
          // through, so there would be nothing left for one to settle.
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
    id: "groups-then-two-lives",
    category: "two-stage",
    name: "Groups, then two lives",
    summary:
      "Groups first, then the ones who come through play a double elimination rather than a straight knockout — so nobody who survived the group stage goes out on a single bad match.",
    signature: "groups → double elimination · top two advance",
    games: "3 minimum, then two lives",
    config: {
      score: { kind: "points" },
      standings: {
        pointsSystem: { win: 1, draw: 0, loss: 0 },
        tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "drawn_lot" }],
      },
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
    id: "rounds-then-cut",
    category: "two-stage",
    name: "Rounds, then a top cut",
    summary:
      "Several rounds paired by record, then the leaders play a knockout for the title. Everybody gets the same number of matches before anyone is eliminated.",
    signature: "closest record → knockout · top eight",
    games: "every round, then a knockout",
    config: {
      pairing: { strategy: "closest_record" },
      standings: {
        pointsSystem: { win: 1, draw: 0.5, loss: 0, bye: 1 },
        tiebreakers: [{ key: "points" }, { key: "buchholz" }, { key: "drawn_lot" }],
      },
      stages: [
        { kind: "swiss", id: "rounds", name: "Rounds", qualification: { count: 8 } },
        { kind: "single_elimination", id: "cut", name: "Top cut" },
      ],
      entrantFields: AFFILIATION,
    },
  },

  /* ── More than two at a time ────────────────────────────────────────────── */
  {
    id: "heats",
    category: "many-at-once",
    name: "Heats of four",
    summary:
      "Four compete in every match and score by where they finish, not by who they beat. Heats are drawn between entrants of similar standing, so nobody spends the evening last.",
    signature: "four per match · finishing order · points by place",
    games: "every round",
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
    id: "timed",
    category: "many-at-once",
    name: "Against the clock",
    summary:
      "Everyone in a heat records a time and the fastest wins. Anyone who does not finish is recorded as such rather than being given a score they did not earn.",
    signature: "six per heat · fastest time",
    games: "every round",
    config: {
      match: { sidesPerMatch: 6 },
      score: { kind: "time", lowerIsBetter: true },
      pairing: { strategy: "random" },
      standings: { tiebreakers: [{ key: "wins" }, { key: "points" }, { key: "drawn_lot" }] },
      stages: [{ kind: "swiss", id: "heats", name: "Heats", rounds: 4 }],
    },
  },
  {
    id: "rotating-partners",
    category: "many-at-once",
    name: "Rotating partners",
    summary:
      "You enter on your own and your partner changes every round. Points are individual, so the table ranks people rather than pairs — which makes it the format for a mixed-ability social evening.",
    signature: "partners redrawn each round · individual scoring",
    games: "every round",
    config: {
      entrant: { kind: "drawn_team", teamSize: 2, redrawEachRound: true },
      score: { kind: "points" },
      pairing: { strategy: "closest_record" },
      standings: {
        pointsSource: "score",
        tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "drawn_lot" }],
      },
      rating: { system: "elo", initial: 1000 },
      stages: [{ kind: "swiss", id: "rounds", name: "Rounds", rounds: 7 }],
    },
  },

  /* ── No end date ────────────────────────────────────────────────────────── */
  {
    id: "ladder",
    category: "ongoing",
    name: "Challenge ladder",
    summary:
      "A standing order with no finish. You challenge somebody a few places above you, and beating them takes their position. Runs for a season, or forever.",
    signature: "ladder · challenge up to three places",
    games: "as many as you like",
    config: {
      stages: [
        { kind: "ladder", id: "ladder", name: "Ladder", challengeRange: 3, takeRungOnWin: true },
      ],
      rating: { system: "elo", initial: 1000 },
      entrantFields: AFFILIATION,
    },
  },

  /* ── Build your own ─────────────────────────────────────────────────────── */
  {
    id: "blank",
    category: "blank",
    name: "Start from nothing",
    summary:
      "A plain knockout with every default left alone. Take it apart on the Rules tab and build whatever you actually run.",
    signature: "single elimination · seeded",
    games: "1 to log₂(n)",
    config: {
      stages: [{ kind: "single_elimination", id: "main", name: "Main draw" }],
    },
  },
];

export function findExample(id: string): Example | undefined {
  return EXAMPLES.find((example) => example.id === id);
}

export function examplesIn(category: CategoryId): Example[] {
  return EXAMPLES.filter((example) => example.category === category);
}
