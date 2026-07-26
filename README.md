# Bracketeer

**Tournament brackets, Swiss pairings, leagues and Elo — running entirely in your browser.**

→ **[maxgfr.github.io/bracketeer](https://maxgfr.github.io/bracketeer)**

No account. No server. No database. You create a tournament, run it, and share a link.

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

Every one of them ships as a file in [`examples/`](examples), and every one is a point in the same
configuration space. Change the score kind and the tiebreak order on "paired by record" and you have
turned a games night into a rated championship. Nothing in the engine noticed.

## Sharing without a server

Bracketeer is a static site on GitHub Pages, so there is nothing to host and nothing to trust.

- **A link** — the tournament's event log is compressed into the URL. A played 16-entrant knockout
  with a consolation bracket comes to under 4 kB. The link is self-contained and works forever.
- **A file** — JSON export, any time. This is the copy to keep.
- **Live sync** — several phones can update the same tournament at once, peer to peer. Turn it on
  and the share link carries the invitation, so whoever opens it gets one tap to join.
- **Print and embed** — the sheet prints properly, and `/embed/:id` gives a read-only view for a
  club website.
- **Offline** — a service worker caches the app, because sports halls have bad signal.

**Honest limitation:** peer-to-peer sync introduces devices to each other through public
third-party relays, and only works while at least one participant has the page open. Some networks
block it. The app says so on the page. The link and the file are the copies that last.

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
pnpm test         # 221 engine tests + 159 app tests
pnpm typecheck
pnpm build
```

```
packages/engine   Pure TypeScript — formats, pairing, standings, ratings, scheduling.
                  No DOM, no React, no network. This is where the rules live.
apps/web          Vite + React + Tailwind. Rendering and interaction only.
examples/         Composed configurations, as data rather than code.
docs/             CONFIG.md is the reference. DESIGN.md is why the code looks like this.
```

The engine is event-sourced: state is a fold over an append-only log. That is what makes URL
sharing compact, peer merges deterministic, and undo free. Nothing in it calls `Math.random()` or
reads the clock, because two devices replaying the same log must reach identical state.

Glicko-2 is verified against the worked example in Glickman's paper; pairing invariants are
property-tested; every format is played end to end.

## Documentation

- **[docs/CONFIG.md](docs/CONFIG.md)** — every option, with worked examples.
- **[docs/DESIGN.md](docs/DESIGN.md)** — the architecture and its trade-offs, including the limits.
- **[CONTRIBUTING.md](CONTRIBUTING.md)** — how to work on it.

## Contributing

Issues and pull requests are welcome. New sports do not need engine changes — if a format cannot be
expressed by composing the axes above, that gap in the model is itself worth an issue.

## License

MIT
