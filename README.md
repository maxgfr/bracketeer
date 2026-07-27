# Bracketeer

**A sport-agnostic tournament engine — brackets, Swiss pairings, leagues and Elo.**

[![npm](https://img.shields.io/npm/v/bracketeer-cli?color=cb3837&label=bracketeer-cli)](https://www.npmjs.com/package/bracketeer-cli)
[![CI](https://github.com/maxgfr/bracketeer/actions/workflows/ci.yml/badge.svg)](https://github.com/maxgfr/bracketeer/actions/workflows/ci.yml)
[![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

The same engine, three ways to reach it:

|  | |
|---|---|
| **A web app** | → **[maxgfr.github.io/bracketeer](https://maxgfr.github.io/bracketeer)** — no account, no server, no database |
| **A command** | `npx bracketeer-cli new --sport petanque --entrants "Marie,Luc,Ana,Paul"` |
| **A library** | `import { replay, parseConfig } from "bracketeer-cli"` — ESM, CJS, typed |

There is also an [agent skill](skills/bracketeer/SKILL.md) and an MCP server, so you can ask an
assistant to run the club night and get back a link to hand out.

---

## Why another bracket tool

Most tournament software is written for one sport and then bent into shape for the others.
Bracketeer is built the other way round: there is no `if (sport === …)` anywhere in the
engine. There are six independent axes, and a sport is just a point in that space.

| Axis | What it decides | Options |
|---|---|---|
| **Entrant** | who plays | `individual` · `fixed_team` · `drawn_team` (partners redrawn each round) |
| **Match shape** | how many meet at once | 2 for head-to-head, 3+ for a free-for-all |
| **Score** | how a result is expressed | `points` · `sets` · `outcome` · `placement` · `time` |
| **Structure** | the shape of the event | `single_elimination` · `double_elimination` · `swiss` · `round_robin` · `groups` · `ladder` · `stepladder` · `page_playoff` |
| **Consolation** | what happens to losers | `none` · `third_place` · `full_consolation` · `repechage` |
| **Pairing** | who plays whom | `seeded` · `random` · `closest_record` · `closest_rating` · `rating_spread` · `berger` |
| **Tiebreakers** | who ranks above whom | an ordered, reorderable list you control |

Compose them and real structures fall out, without writing code. The app offers them as **shapes**,
grouped by the question you are actually asking — never as a list of sports. A list of sports tells
everybody whose game is missing that this is not for them, and hides the fact that two events which
look nothing alike are usually the same structure with a couple of settings changed.

| If you want… | Shapes |
|---|---|
| **Losing to matter** — short, decisive | straight knockout · knockout with a second draw · two lives · best of three · climb to the top seed · four-way finish |
| **Everybody to keep playing** — same number of matches each | everyone plays everyone · a season home and away · paired by record · paired by record, wide field |
| **A few matches, then a decision** | groups then a knockout · pools then a knockout with a second draw · rounds then a top cut |
| **More than two at a time** | heats of four · against the clock · rotating partners |
| **No end date** | challenge ladder |

The app draws each one, and the drawing is traced from a tournament the engine actually plays — so
a diagram cannot describe a structure the rules do not produce. Every shape ships as a file in
[`examples/`](examples), and every one is a point in the same configuration space.

There is also a list of **sports** — rugby, pétanque, volleyball, a fighting game, a battle royale,
and a dozen more. They are not modes: each one is a shape from the list above with the scoring and
tiebreaks already filled in, and each says which shape it is, because typing a points system in from
memory is a chore and the software still does not know what a scrum is. Change the score kind and the tiebreak order on "paired by record" and you have
turned a games night into a rated championship. Nothing in the engine noticed.

## Sharing without a server

Bracketeer is a static site on GitHub Pages, so there is nothing to host and nothing to trust.
Nothing is listed anywhere; a tournament exists on the device that made it, and in whatever you
deliberately send.

- **Two links** — a **watch** link with private fields stripped out and no key, and an
  **organiser** link that carries everything and lets that device enter scores. The tournament's
  event log is compressed into the URL either way.
  A played 16-entrant knockout with a consolation bracket comes to under 4 kB, and it is
  self-contained: it works forever, with no server holding a copy.
  Every control that shares — the one in the toolbar, the one on the Share tab, the CLI — builds
  its link with the same function, and the watch link is the default everywhere.
- **Private by default** — a custom entrant field (a phone number, a licence number, an emergency
  contact) stays on your device until you tick it to share. Private means *absent*: the value and
  the column are both missing from the watch link, rather than hidden inside it.
- **A file** — JSON export, any time. This is the copy to keep.
- **Live sync** — several phones can update the same tournament at once, peer to peer. It is
  between **organiser links only**: the room is derived from the organiser key, so finding it
  already means holding it, and the key itself never goes on the wire. A watch link cannot join,
  and the app says so instead of offering a button that fails.
- **Print and embed** — the sheet prints properly, and `/embed/:id` gives a read-only view for a
  club website, carrying the same redaction as the watch link.
- **Offline** — a service worker caches the app, because sports halls have bad signal.

**Honest limitations:** peer-to-peer sync introduces devices to each other through public
third-party relays, and only works while at least one participant has the page open. Some networks
block it. The app says so on the page. And a watch link cannot be un-sent — whoever has it keeps a
copy of what it carried. The link and the file are the copies that last.

## From a terminal

```bash
npx bracketeer-cli new --sport petanque --entrants "Marie,Luc,Ana,Paul"
npx bracketeer-cli status <id>      # says the one thing to do next
npx bracketeer-cli report <id> "Marie v Luc" --score "13-7"
npx bracketeer-cli standings <id>
npx bracketeer-cli link <id>        # a watch link, ready to paste into the site
```

Every command takes `--json`. Tournaments are files in `~/.bracketeer`, written in the format the
web app imports, so one can start here and finish on a phone.

## As a library

```bash
npm install bracketeer-cli
```

```ts
import { createTournament, addEntrant, appendEvent, replay } from "bracketeer-cli";
import { findExample } from "bracketeer-cli/presets";

let log = appendEvent([], "me", createTournament({
  name: "Club night",
  config: findExample("knockout")!.config,
  seed: 7,
  createdAt: new Date().toISOString(),
}), Date.now());

log = appendEvent(log, "me", addEntrant({ id: "ana", name: "Ana" }), Date.now());
const state = replay(log);
```

Commands return events, you append them, and the state is a fold over the log. Nothing mutates, so
undo is dropping an event, two devices replaying the same log reach identical state, and correcting
a score three rounds back fixes every standing and rating after it.

ESM and CommonJS, with types. `parseConfig({})` already gives you a runnable tournament, so you
only write the deltas you care about. Full reference in [`packages/cli/README.md`](packages/cli/README.md).

## From a conversation

`bracketeer-mcp` offers the same operations as MCP tools:

```json
{
  "mcpServers": {
    "bracketeer": { "command": "npx", "args": ["-y", "--package=bracketeer-cli", "bracketeer-mcp"] }
  }
}
```

Or install the [agent skill](skills/bracketeer/SKILL.md), which teaches an assistant to drive the
command — into any of seventy-odd coding agents:

```bash
npx skills add maxgfr/bracketeer          # -g for every project
```

The skill's claims are tested rather than trusted: `packages/cli/test/skill.test.ts` fails if it
names a command that does not exist, a flag the parser ignores, or a score notation that would be
rejected. A skill that has drifted is worse than no skill, because it gets followed confidently.

One package rather than three, because one package is one publication to keep in step.

## Ratings

Elo by default — configurable K-factor, optional margin-of-victory weighting, a rating floor.
Glicko-2 when players have few games, since it carries its own uncertainty. A TrueSkill-style
system for teams and free-for-alls. Or none at all.

Ratings are always derived by replaying matches, never stored, so correcting a score entered three
rounds ago fixes every rating downstream of it.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # 941 tests: 279 engine · 380 presets · 144 cli · 138 app
pnpm typecheck
pnpm build

pnpm --filter @bracketeer/web test:e2e        # 9 browser tests, in the Chrome you have
RUN_P2P_TESTS=1 pnpm --filter @bracketeer/web test  # real WebRTC over public relays
```

```
packages/engine   Pure TypeScript — formats, pairing, standings, ratings, scheduling,
                  redaction. No DOM, no React, no network. This is where the rules live.
packages/presets  Shapes and sports, as data. Outside the engine because the engine
                  must never contain the name of a sport, and a test enforces that.
packages/cli      The library, the `bracketeer` command and the MCP server, over one
                  set of operations so the front ends cannot disagree.
apps/web          Vite + React + Tailwind. Rendering and interaction only.
skills/           The agent skill, installable with `npx skills add`.
examples/         Composed configurations, as data rather than code.
docs/             CONFIG.md is the reference. DESIGN.md is why the code looks like this.
```

The engine is event-sourced: state is a fold over an append-only log. That is what makes URL
sharing compact, peer merges deterministic, and undo free. Nothing in it calls `Math.random()` or
reads the clock, because two devices replaying the same log must reach identical state.

Glicko-2 is verified against the worked example in Glickman's paper; pairing invariants are
property-tested; every format is played end to end. The browser suite checks the one claim the
others structurally cannot — that a watch link shows a stranger nothing private — against the built
bundle, in a real browser.

Releases are cut from the commit messages: `fix:` a patch, `feat:` a minor, `feat!:` a major.
Merging to `main` runs everything above and then publishes to npm on its own, with provenance.
See [CONTRIBUTING.md](CONTRIBUTING.md).

## Documentation

- **[docs/CONFIG.md](docs/CONFIG.md)** — every option, with worked examples.
- **[docs/DESIGN.md](docs/DESIGN.md)** — the architecture and its trade-offs, including the limits.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — how to work on it.

## Contributing

Issues and pull requests are welcome. New sports do not need engine changes — if a format cannot be
expressed by composing the axes above, that gap in the model is itself worth an issue.

## License

MIT
