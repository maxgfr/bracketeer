# Design

Why the code is shaped the way it is.

## The engine knows nothing about sports

The temptation in tournament software is to write `if (sport === …)`. It works
for the first sport and gets worse with every one after it, because the special
cases multiply against each other: this sport *with* a consolation bracket *and*
strength-of-schedule tiebreaks *and* pairs instead of individuals.

So the engine has no sport concept at all. It has six orthogonal axes — entrant
kind, score kind, structure, consolation policy, pairing strategy, tiebreak order
— and a sport is a point in that space. No sport required an engine change;
every structure in `examples/` is a JSON file.

This reaches the interface too. The starting points are named for what they do —
"two lives", "paired by record", "heats of four" — and grouped by the question an
organiser is actually asking, never by sport. A list of sports is a promise you
have to keep forever, and it tells everybody whose game is missing that the app
is not for them.

The test of the model is whether a structure nobody anticipated is expressible.
Rotating partners — you enter alone, your partner changes every round, and the
table ranks individuals — is `drawn_team` entrants with `pointsSource: "score"`.
Nothing was added for it.

## The single seam: normalisation

Five ways of recording a result collapse into one `NormalizedOutcome` in
[`scoring/normalize.ts`](../packages/engine/src/scoring/normalize.ts):

```ts
{ places: number[][], pointsFor: number[] | null, winner: number | null, ... }
```

Everything downstream — points, tiebreakers, ratings, bracket progression — reads
only that. A new way of scoring means one new case in one file, and nothing else
in the engine changes. Without this seam, every consumer would need a switch over
the score kind, and they would drift apart.

## State is a fold over an event log

A tournament is not stored. It is an append-only list of things that happened,
and `replay(log)` produces the state. One decision pays for itself four times:

- **The link is the storage.** With no server, the log has to fit in a URL. It
  compresses far smaller than derived state — a played 16-entrant knockout with a
  consolation bracket is under 4 kB.
- **Merging peers is set union.** Two devices that were apart for ten minutes
  take the union of their events, sort by `(lamport, actor, seq)`, and replay.
  Both reach identical state, in any order, with no conflict resolution to get
  wrong.
- **Undo is dropping an event.**
- **It is reproducible**, which makes golden-file testing possible.

Wall-clock time is recorded but never used for ordering — phones in a hall
disagree about what time it is, and a tournament must not depend on that.

### Rounds record decisions, not instructions

`round_generated` carries fully materialised fixtures rather than "pair round 3".
Pairing depends on standings, ratings and drawn lots *at the moment it runs*, so
re-deriving it later could produce a different draw from the one that was played.
Recording the decision also means an organiser can override a fixture by hand
without the log misrepresenting what happened.

## Determinism is a hard requirement

Nothing in the engine calls `Math.random()` or reads the clock. Every draw comes
from a seed stored in the log, through the PRNG in
[`util/rng.ts`](../packages/engine/src/util/rng.ts). A random pairing that
differed between two devices would silently fork a tournament, and nobody would
notice until the standings disagreed.

## Constraints are costs, not rules

In the last round of most Swiss events, "never repeat a fixture" and "pair
everyone" cannot both be satisfied. A hard rule fails there and leaves the
organiser stuck. A weighted cost degrades: the solver finds the least-bad round
and reports which constraints it had to break — information you can act on rather
than an error message.

Pairing is minimum-cost matching by branch and bound, seeded with a greedy
solution so there is always an answer to return, and capped by a node budget so a
large field degrades to "very good" instead of hanging. A property test confirms
it finds the forced rematch-free round at the end of a round robin.

Separation costs are *normalised* — score-group distance, and rating distance as
a fraction of the field's range — so a weight means the same thing whether the
sport scores 3-1-0 or 1-0.5-0, and whether ratings run 0–3000 or 0–50.

## Propagation converges before it concludes

Brackets are built in full up front, with empty slots wired to the fixture that
will fill them. Results flow through those links, so no round is ever
"generated".

This has one subtlety that cost a real bug. A slot fed by a *bye* can never be
filled, and the match downstream must become a walkover rather than wait forever.
But mid-convergence a semi-final can hold a result while its own slots are still
being filled from round one — read strictly at that moment, it looks like it
produced no winner, and the final gets retired before anybody plays it. So
propagation runs in two phases: occupants settle to a fixed point first, and only
then are terminal conclusions drawn.

## The web app renders; it does not decide

`packages/engine` has no DOM, no React and no network. Every interaction in the
app is `dispatch(event)` — append to the log, replay, render. There is no second
source of truth to fall out of step, and a peer's arriving events cannot conflict
with local mutation because there is none.

This is also why the app is testable: the sixteen behaviour tests drive the real
components and catch the wiring that engine unit tests cannot.

## Honest limits

- **Peer-to-peer sync depends on infrastructure we do not control.** Devices meet
  through public relays, and it only works while at least one participant has the
  page open. Some networks block it. The app says so on the page rather than in a
  footnote, and the link and exported file remain the durable copies.
- **Very large tournaments outgrow a URL.** The app measures the encoded length
  and pushes you towards the file export before a link gets long enough to be
  truncated in transit.
- **The TrueSkill implementation is the two-player update generalised to adjacent
  finishing positions**, not the full factor graph. It orders a field correctly;
  it does not model it exactly. That is stated in the source rather than implied.
- **The compass draw is not implemented** — the eight-bracket structure where
  losers fall sideways at every round, not only the first. Of the named
  structures a survey turned up, it is the only one this model does not reach;
  everything else either exists or composes.
- **`localStorage` is the only local persistence**, so a cleared browser loses
  what has not been exported. The app warns when the browser refuses to save.

## Verification

- **Property tests** (`fast-check`) for pairing invariants: everyone plays at
  most once per round, no rematch when the constraint holds, byes distributed
  fairly, the same round on every device.
- **Against published values.** Glicko-2 reproduces the worked example in
  Glickman's paper. Elo is checked against the defining property of the scale
  (400 points is odds of 10:1) and for being zero-sum.
- **Whole tournaments** are played end to end through the real command API, one
  per format, checking the things that actually go wrong: that a bracket resolves
  to one winner, that Swiss never repeats a fixture, that byes rotate, that a
  first-round loser still plays.
- **Round trips.** `decode(encode(log))` reproduces the log; two divergent logs
  merge to the same state in either order.
