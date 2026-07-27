# Configuration

Everything a tournament is, is in one object. There is no sport anywhere in it —
only six independent choices, and a sport is what you get by combining them.

`parseConfig({})` yields a working tournament, so you only ever write the parts
you want to change. The complete schema lives in
[`packages/engine/src/domain/config.ts`](../packages/engine/src/domain/config.ts).

---

## 1. Who plays — `entrant`, `match`

```jsonc
{
  "entrant": { "kind": "individual" },
  "match": { "sidesPerMatch": 2, "hasHomeSide": false }
}
```

| `entrant.kind` | Meaning |
|---|---|
| `individual` | One person or one machine per side. |
| `fixed_team` | A roster that stays together all tournament. `teamSize` may be `null` for any size. |
| `drawn_team` | Partners recomposed each round: you enter alone and play with somebody different every time. Set `teamSize` and `redrawEachRound`. |

`match.sidesPerMatch` is `2` for head-to-head and `3` or more for a free-for-all:
a race, a heat, a battle royale. `hasHomeSide` turns on home-and-away balancing.

## 2. How you win — `score`

| `kind` | For | Result shape |
|---|---|---|
| `points` | A number each, however you count it | `{ scores: [13, 11] }` |
| `sets` | Decided by sets, games or legs | `{ sets: [[6,4],[3,6],[6,2]] }` |
| `outcome` | Anything where only the verdict is recorded | `{ winner: 0 }` or `{ winner: null }` for a draw |
| `placement` | Three or more at once, ranked by finish | `{ places: [[2],[0],[3],[1]] }` |
| `time` | A measured time or distance | `{ times: [12.4, 11.9, null] }` |

```jsonc
{ "score": { "kind": "points", "target": 13, "allowDraw": false } }
```

`target` is "first to N"; leave it `null` for open-ended scoring such as goals.
`cap` sets a hard ceiling. For `placement`, `pointsByPlace` gives the points table
(`[15, 12, 10, 8]`); competitors who tie share the points of the places they
occupy. For `time`, `lowerIsBetter: false` covers distance thrown or time
survived.

Every one of these normalises to the same internal outcome, which is why nothing
downstream — points, tiebreakers, ratings, bracket progression — has to know
which sport it is looking at.

## 3. The shape — `stages`

A tournament is a *pipeline*. Each stage takes entrants, plays, and passes its
qualifiers to the next.

| `kind` | Notes |
|---|---|
| `single_elimination` | `seeding`, `consolation` |
| `double_elimination` | `grandFinalReset` — must the unbeaten finalist be beaten twice? `playGrandFinal: false` turns it into a pool where both survivors qualify, so there is nothing left for a final to settle |
| `round_robin` | `legs` (2 for home and away), `mirrorLegs` |
| `swiss` | `rounds` (`null` derives `ceil(log2(n))`) |
| `groups` | `groupCount`, `groupSize`, `distribution`, and an `inner` stage each group plays |
| `ladder` | `challengeRange`, `takeRungOnWin` |
| `stepladder` | `rungs` — the lowest qualifier climbs one rung at a time |
| `page_playoff` | A four-entrant finish; the top two get a second chance |

```jsonc
{
  "stages": [
    { "kind": "groups", "id": "groups", "groupCount": 4,
      "inner": { "kind": "round_robin" },
      "qualification": { "perGroup": 2 } },
    { "kind": "single_elimination", "id": "knockout", "consolation": "third_place" }
  ]
}
```

`qualification` decides who moves on: `count` overall, `perGroup` from each
table, and `bestOfRest` to top up with the best runners-up across groups.

`seeding.method` is `standard` (the classic fold that keeps the top seeds apart),
`ordered`, `random`, `by_rating`, or `manual` with an explicit `slots` array.

Swiss stages also take `accelerated: { rounds, bonus }`. For the first few rounds
the stronger half of the field carries virtual points, so top entrants meet each
other straight away instead of spending three rounds beating the bottom of the
draw. The bonus shapes the draw only and never reaches the table — that is the
whole difference from the starting scores below.

## 4. If you lose — `consolation`

On an elimination stage:

| Value | What happens to the losers |
|---|---|
| `none` | They go home. |
| `third_place` | The beaten semi-finalists play off. |
| `full_consolation` | Everyone beaten in round one enters a second bracket of their own. |
| `repechage` | Losers get a second path, and its winner earns a place in the final. |

`full_consolation` is the direct answer to drawing the eventual champion in round
one: you lose, you drop into a bracket of the other first-round losers, and you
still have a tournament to play. Some competitions call this the consolante or
the plate; it is the same thing.

## 5. Who plays whom — `pairing`

```jsonc
{
  "pairing": {
    "strategy": "closest_record",
    "byePolicy": "lowest_ranked",
    "constraints": {
      "avoidRematch": { "enabled": true, "weight": 1000 },
      "avoidSameMeta": { "enabled": true, "field": "club", "weight": 500 },
      "balanceByes": { "enabled": true, "weight": 800 },
      "balanceHomeAway": { "enabled": true, "weight": 100 }
    }
  }
}
```

| Strategy | Pairs |
|---|---|
| `seeded` | Strongest against weakest. |
| `random` | Drawn from the tournament seed. |
| `closest_record` | Entrants on the same record — the Swiss idea. |
| `closest_rating` | The nearest ratings available. |
| `rating_spread` | The widest gaps, so ratings converge faster on a new field. |
| `berger` | The circle method — everyone meets everyone. |

**Constraints are weighted costs, not hard rules.** In the last round of most
Swiss events, "never repeat a fixture" and "pair everyone" cannot both hold. A
hard rule fails there; a cost degrades to the least-bad round and reports which
constraints it had to break. Separation costs are normalised — score-group
distance, and rating distance as a fraction of the field's range — so a weight
means the same thing whether the sport scores 3-1-0 or 1-0.5-0.

`avoidSameMeta.field` refers to a custom entrant field you define in
`entrantFields`, so "keep club-mates apart" needs no special support.

## 6. Who ranks above whom — `standings`

```jsonc
{
  "standings": {
    "pointsSource": "outcome",
    "pointsSystem": { "win": 3, "draw": 1, "loss": 0, "bye": 3 },
    "tiebreakers": [
      { "key": "points" },
      { "key": "point_diff" },
      { "key": "points_for" },
      { "key": "drawn_lot" }
    ]
  }
}
```

`pointsSource` is `outcome` (a win is worth a fixed amount) or `score` (what you
actually scored counts directly — a heats night, an athletics meeting).

`initialScore` is the **McMahon system**: entrants begin
on a score derived from their rating, so a field spanning a huge range of
strength meets its own level from round one. Unlike accelerated pairings, the
head start counts right through to the final table.

```jsonc
{ "initialScore": { "source": "rating_band", "bandSize": 100, "maxBonus": 3, "floor": 1200 } }
```

| Tiebreaker | Measures |
|---|---|
| `points` · `wins` · `matches_played` | The record itself |
| `head_to_head` | Results among the tied entrants only |
| `buchholz` | The strength of the opponents you faced |
| `median_buchholz` | Buchholz with the best and worst opponent dropped |
| `sonneborn_berger` | The strength of the opponents you *beat* |
| `point_diff` · `points_for` · `points_against` | Margins |
| `rating` · `opponent_avg_rating` | Ratings |
| `drawn_lot` | A deterministic draw — always resolves |

They apply **in order**, each only to the entrants still level after the one
before it. Put a strength-of-opposition measure high and a hard draw stops being
a punishment; put point difference high and margins start to matter.

A bye counts in Buchholz as a virtual opponent of your own strength. Counting it
as zero would punish whoever drew the odd number, which is the opposite of what
these measures exist to do.

**Bonus points** work off signals every score kind can produce, so one rule works
for any sport:

```jsonc
{ "bonusRules": [
  { "id": "losing-bonus", "condition": { "kind": "loss_margin_at_most", "value": 7 }, "points": 1 }
] }
```

Conditions: `win_margin_at_least`, `loss_margin_at_most`, `points_for_at_least`,
`shutout`.

---

## Ratings

```jsonc
{ "rating": { "system": "elo", "initial": 1500, "elo": { "k": 24, "marginOfVictory": true } } }
```

| System | Best for |
|---|---|
| `none` | Leagues that do not rate players. |
| `elo` | The default. Simple enough that competitors can check it themselves. |
| `glicko2` | Players with few games — it carries its own uncertainty and volatility. |
| `trueskill` | Teams and free-for-alls. |

Ratings are always **derived**, never stored: they are recomputed by replaying
matches. Correct a score entered three rounds ago and every rating downstream of
it fixes itself.

A free-for-all splits one result across the pairwise comparisons it implies,
weighted so a twelve-way race does not move ratings eleven times as much as a
duel.

## Scheduling

```jsonc
{
  "schedule": {
    "startsAt": "2026-06-01T09:00:00.000Z",
    "matchDurationMinutes": 45,
    "breakBetweenRoundsMinutes": 15,
    "venues": [{ "id": "p1", "name": "Piste 1", "capacity": 1 }]
  }
}
```

Rounds run in order; within a round, fixtures fill the available courts. Where a
round needs more courts than exist, it spills into further waves. Conflicts are
reported, never blocked.

## Custom entrant fields

```jsonc
{
  "entrantFields": [
    { "key": "club", "label": "Club", "private": false },
    { "key": "phone", "label": "Phone" }
  ]
}
```

These appear against every entrant, show in the table, and can be referenced by
`pairing.constraints.avoidSameMeta.field`.

**`private` defaults to `true`.** A field is kept to the organiser's device
unless it says otherwise, so the example above publishes the club and keeps the
phone number. "Private" here means *absent* rather than protected: the value and
the field definition are both removed from anything shared with a watching
audience, so there is nothing in the link to read back out. Leaving the
definition in would give the public copy an empty column for every entrant and
quietly announce that you collect phone numbers, which is most of what was meant
to stay private.

Publish a field by saying so:

```jsonc
{ "entrantFields": [{ "key": "country", "label": "Country", "private": false }] }
```

---

## Formats that need no new structure

Several named systems are reachable by composing what is already here, and there
are tests asserting it in `packages/engine/test/formats-extra.test.ts`:

| System | Composition |
|---|---|
| **Monrad** | Swiss with `seeding.method: "random"` |
| **Danish** | Monrad with `avoidRematch.enabled: false` |
| **Pool play** | `groups` whose `inner` is `double_elimination` |
| **Top cut** | `qualification.count` feeding the next stage |
| **King of the hill** | `ladder` |
| **Consolante / second chance** | `consolation: "full_consolation"` |

**Not implemented:** the compass draw, an eight-bracket structure where losers
fall sideways at every round rather than only the first. It is the one named
structure from a survey of the field that this model does not currently reach.

## Worked examples

Every file in [`examples/`](../examples) is a complete configuration reachable
through these six axes, named for what it does rather than for a sport. Compare `all-play-all.json` with `paired-by-record.json`: they differ in the
structure, the score kind and the tiebreak order, and in nothing else.
