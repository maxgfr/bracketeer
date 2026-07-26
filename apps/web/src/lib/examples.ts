/**
 * Worked examples.
 *
 * These are compositions, not modes — every one is reachable by turning the same
 * six dials, and each exists to show that a sport is a point in the configuration
 * space rather than a branch in the engine. Starting from one and editing it is
 * the fastest way to reach a rule set nobody anticipated.
 */

import type { TournamentConfigInput } from "@bracketeer/engine";

export interface Example {
  id: string;
  name: string;
  summary: string;
  /** The choices that make this example what it is, for the chooser. */
  signature: string;
  config: TournamentConfigInput;
}

export const EXAMPLES: Example[] = [
  {
    id: "petanque-concours",
    name: "Pétanque concours",
    summary:
      "Games to 13, paired against whoever has the same record, with a consolation bracket so a first-round loss is not the end of the day. A hard draw is rewarded rather than punished.",
    signature: "closest record · consolation · Buchholz",
    config: {
      entrant: { kind: "fixed_team", teamSize: 2 },
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
      stages: [{ kind: "swiss", id: "main", name: "Concours" }],
      entrantFields: [{ key: "club", label: "Club" }],
    },
  },
  {
    id: "chess-swiss",
    name: "Chess Swiss",
    summary:
      "Draws count for half a point, nobody is eliminated, and ties are broken by the strength of the opposition you faced. Glicko-2 handles players with few rated games.",
    signature: "outcome · draws · Sonneborn-Berger",
    config: {
      score: { kind: "outcome", allowDraw: true },
      pairing: {
        strategy: "closest_record",
        constraints: { avoidSameMeta: { enabled: true, field: "club" } },
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
      stages: [{ kind: "swiss", id: "main", name: "Swiss" }],
      entrantFields: [{ key: "club", label: "Club" }],
    },
  },
  {
    id: "football-league",
    name: "Football league",
    summary:
      "Everyone plays everyone home and away, three points for a win, separated by goal difference. Fixtures carry dates and grounds, and the season exports to a calendar.",
    signature: "two legs · home and away · 3-1-0",
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
      schedule: { matchDurationMinutes: 105, breakBetweenRoundsMinutes: 0 },
      stages: [{ kind: "round_robin", id: "season", name: "Season", legs: 2 }],
    },
  },
  {
    id: "esports-double-elim",
    name: "Esports double elimination",
    summary:
      "Best-of-three, seeded, and everyone gets a second life in the lower bracket. The unbeaten finalist must be beaten twice to lose the title.",
    signature: "double elimination · best of 3 · grand final reset",
    config: {
      score: { kind: "sets", bestOf: 3 },
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
    },
  },
  {
    id: "world-cup",
    name: "Groups into a knockout",
    summary:
      "Four groups play round robins, the top two from each advance, and the knockout decides it. The classic two-stage tournament.",
    signature: "groups → knockout · top two advance",
    config: {
      entrant: { kind: "fixed_team" },
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
          name: "Group stage",
          groupCount: 4,
          inner: { kind: "round_robin" },
          qualification: { perGroup: 2 },
        },
        { kind: "single_elimination", id: "knockout", name: "Knockout", consolation: "third_place" },
      ],
    },
  },
  {
    id: "free-for-all",
    name: "Free-for-all night",
    summary:
      "Four at a time, scored by where you finish rather than whether you won. Racing games, karts, a shooting heat — anything where the whole field plays at once.",
    signature: "four sides · finishing position · points by place",
    config: {
      match: { sidesPerMatch: 4 },
      score: { kind: "placement", pointsByPlace: [15, 12, 10, 8] },
      pairing: { strategy: "closest_record" },
      standings: {
        pointsSource: "score",
        tiebreakers: [{ key: "points" }, { key: "wins" }, { key: "drawn_lot" }],
      },
      rating: { system: "trueskill" },
      stages: [{ kind: "swiss", id: "heats", name: "Heats", rounds: 6 }],
    },
  },
  {
    id: "americano",
    name: "Padel americano",
    summary:
      "You enter alone and your partner changes every round. Points are individual, so the table ranks players rather than pairs.",
    signature: "partners redrawn · individual points",
    config: {
      entrant: { kind: "drawn_team", teamSize: 2, redrawEachRound: true },
      score: { kind: "points", target: 24 },
      pairing: { strategy: "closest_record" },
      standings: {
        pointsSource: "score",
        tiebreakers: [{ key: "points" }, { key: "point_diff" }, { key: "drawn_lot" }],
      },
      rating: { system: "elo", initial: 1000 },
      stages: [{ kind: "swiss", id: "main", name: "Americano", rounds: 7 }],
    },
  },
  {
    id: "blank",
    name: "Start from nothing",
    summary: "A plain single-elimination bracket you can take apart and rebuild however you like.",
    signature: "single elimination · seeded",
    config: {
      stages: [{ kind: "single_elimination", id: "main", name: "Main draw" }],
    },
  },
];

export function findExample(id: string): Example | undefined {
  return EXAMPLES.find((example) => example.id === id);
}
