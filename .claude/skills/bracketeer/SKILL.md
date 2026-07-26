---
name: bracketeer
description: Use when working in the Bracketeer repository — adding or changing a tournament format, scoring kind, pairing strategy, tiebreaker or rating system; touching packages/engine; wiring something new into the Rules panel; or on asks like "can Bracketeer do compass draw", "add support for darts", "add a sport", "why is my Swiss pairing wrong", "the bracket is stuck on pending", "add a tiebreaker". Read it before writing engine code, because most requests that sound like new features are configuration here and must not become code.
---

# Working on Bracketeer

Bracketeer runs tournaments for any sport without knowing what a sport is. Before
you write anything, understand the one rule that shapes every file here.

## The rule

**No sport appears in the engine. Ever.** There is no `if (sport === 'petanque')`
and there must never be one. A sport is a *point* in a configuration space made
of independent axes:

| Axis | Where it lives |
|---|---|
| Who plays | `entrant.kind`, `match.sidesPerMatch` |
| How you win | `score.kind` — points, sets, outcome, placement, time |
| The shape | `stages[]` — a pipeline, each feeding qualifiers to the next |
| What losing costs | `consolation` on elimination stages |
| Who plays whom | `pairing.strategy` + weighted constraints |
| Who ranks above whom | `standings.tiebreakers`, applied in order |

Everything is in `packages/engine/src/domain/config.ts`. That file *is* the
product's contract.

## Before adding a format, prove it cannot be composed

This is the most common mistake in this repo. Most requests that sound like new
formats are configuration. Work through this before touching code:

1. Write the format as a config object and try it. `parseConfig({...})` plus a
   `Driver` in `test/tournament.ts` will tell you in a minute.
2. Check the ones already known to be reachable — there are tests asserting this
   in `test/formats-extra.test.ts`:
   - **Monrad** = Swiss with random seeding
   - **Danish** = Monrad with `avoidRematch.enabled: false`
   - **Pool play** = `groups` whose `inner` is `double_elimination`
   - **Top cut** = `qualification.count` feeding the next stage
   - **King of the hill** = `ladder`
   - **Consolante / second chance** = `consolation: "full_consolation"`
3. Only if it is genuinely unreachable, add it — and add a test to
   `test/formats-extra.test.ts` saying *why* it needed code.

If it composes, the deliverable is an entry in `apps/web/src/lib/examples.ts`,
not a new stage kind. Examples are written out to `examples/*.json` by a test.

## Invariants you must not break

**Nothing in `packages/engine` may call `Math.random()` or read the clock.**
Two devices replaying the same event log must reach byte-identical state. A
random draw that differs between phones silently forks a tournament and nobody
notices until the standings disagree. Use `createRng(seed)` from
`src/util/rng.ts`; the seed lives in the log.

**State is a fold over an append-only log.** `replay(log)` is the only way a
`TournamentState` is produced. Never mutate state; emit an event. Commands in
`src/commands/index.ts` return `DomainEvent[]` and the caller appends them.

**Rounds record decisions, not instructions.** `round_generated` carries fully
materialised fixtures. Pairing depends on standings and drawn lots at the moment
it runs, so re-deriving it later could produce a different draw than the one
that was played.

**New scoring goes through `normalizeResult` and nowhere else.** Every score
kind collapses to one `NormalizedOutcome` in `src/scoring/normalize.ts`.
Standings, ratings and bracket progression read only that. If you find yourself
switching on `score.kind` outside that file, you are about to create the drift
the seam exists to prevent.

**The engine has one dependency (`zod`) and keeps it.** Compression is injected
by the host — see `Compressor` in `src/codec/index.ts` — precisely so the engine
stays free of it.

## Where things live

```
packages/engine/src/
  domain/config.ts      the contract — the six axes
  domain/entities.ts    Entrant, Match, Side, TournamentState
  events/               event types, replay, deterministic merge
  scoring/normalize.ts  the seam every score kind passes through
  standings/            records, tiebreakers, McMahon starting scores
  formats/              bracket and schedule builders
  pairing/              strategies, weighted cost, branch-and-bound solver
  rating/               elo, glicko2, trueskill
  schedule/             dates, venues, ICS
  codec/                URL encoding
  commands/             the API the app drives
apps/web/src/
  routes/panels/        one panel per tab; Config.tsx is the rules editor
  components/Sheet.tsx  the shared UI grammar — rules and rows, never cards
  lib/examples.ts       worked configurations
```

## Recipes

### Add a tiebreaker

1. Add the key to `tiebreakerKeySchema` in `domain/config.ts`.
2. Add a case to `metric()` in `standings/tiebreakers.ts`. If it can only be
   computed relative to the tied group (like head-to-head), handle it in
   `valuesFor` instead and explain why in a comment.
3. Add a label and title to `TIEBREAKER_LABELS` / `TIEBREAKER_TITLES` in
   `apps/web/src/lib/format.ts`, and the key to `TIEBREAKER_KEYS` in
   `routes/panels/Config.tsx`.
4. Test it against a scenario, not a value: *"puts the player with three narrow
   losses above the one who only beat the bottom"*.

### Add a score kind

1. Add the variant to `scoreConfigSchema` and to `MatchResult` in
   `domain/entities.ts`.
2. Add a case to `normalizeResult`. This is the only place that branches.
3. Add an entry form to `components/ScoreEntry.tsx` — the form shape follows the
   configured kind, which is how one component serves every sport.
4. Add a case to `scoreline()` in `lib/format.ts`.

### Add a pairing strategy

1. Add it to `pairingStrategySchema`.
2. Add a case to `separationCost` in `pairing/cost.ts`. Return **normalised**
   cost — score-group distance, or rating distance as a fraction of the field's
   range — so a weight means the same thing in every sport.
3. Add a case to `orderForStrategy` in `pairing/index.ts` if it needs the field
   sorted differently.
4. Extend the property tests in `test/pairing.test.ts`; the invariants there
   apply to every strategy.

### Add a stage kind

1. Add a schema in `domain/config.ts` and include it in both
   `innerStageSchema` and `stageConfigSchema`.
2. Write a builder in `formats/`. Wire empty slots to the fixture that will fill
   them with `winnerOf` / `loserOf`; do not generate rounds lazily unless the
   draw genuinely depends on results (Swiss and ladder are the only two).
3. Add a case to `buildStageMatches` in `commands/index.ts`, and check whether
   `isStageComplete` needs one.
4. Add a label to `STAGE_LABELS` in `apps/web/src/lib/format.ts`.

## Testing

```bash
pnpm test        # engine + app
pnpm typecheck
pnpm build
```

Match the existing conventions:

- **Name tests after behaviour**, not implementation. `"never repeats a
  fixture"` beats `"buildSwissRound works"`.
- **Play whole tournaments** through `Driver` in `test/tournament.ts` rather than
  asserting on builder output — that is what catches propagation bugs.
- **Property-test pairing** with `fast-check`. The invariants are: everyone plays
  at most once per round, no self-pairing, byes rotate, and the same inputs
  produce the same round on every device.
- **Check numeric systems against published values.** Glicko-2 is verified
  against the worked example in Glickman's paper. If you change it and that test
  fails, you broke it — do not adjust the expectation.

## UI conventions

The visual world is a printed results sheet. Structure is **horizontal rules and
rows, never cards**. Figures are tabular and monospaced so scores stack. One
signal red, reserved for what is live or needs a score.

- Reuse `components/Sheet.tsx` — `Section`, `Row`, `Field`, `Select`,
  `NumberInput`, `Button`, `Empty`, `Notice`. Do not hand-roll a control that
  exists there.
- Every control must be visibly a control. An input styled as text is an input
  nobody finds.
- Check contrast numerically before introducing an ink. Muted ink already sits at
  the lightest value that clears 4.5:1.
- The app must print and embed. Mark interface chrome `no-print`.

## Honest limits — do not paper over these

State them plainly if they come up; the app already does:

- **P2P sync** uses public relays nobody controls, and only works while somebody
  has the page open. Some networks block it. The share link and the JSON export
  are the durable copies.
- **Large tournaments outgrow a URL.** `urlSizeVerdict()` measures it; the app
  steers people to the file export before a link gets truncated.
- **TrueSkill here is the two-player update generalised to adjacent finishing
  positions**, not the full factor graph. It orders a field; it does not model
  one exactly.
- **Compass draw** (the eight-bracket tennis format) is not implemented.
