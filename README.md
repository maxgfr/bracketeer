# Bracketeer

**Tournament brackets, Swiss pairings, leagues and Elo ratings — running entirely in your browser.**

→ **[maxgfr.github.io/bracketeer](https://maxgfr.github.io/bracketeer)**

No account. No server. No database. You create a tournament, run it, and share a link.

---

## Why another bracket tool

Most tournament software is written for one sport and then bent into shape for the others.
Bracketeer is built the other way round: there is no notion of "pétanque mode" or "chess mode"
anywhere in the engine. There are six independent axes, and a sport is just a point in that space.

| Axis | What it decides | Options |
|---|---|---|
| **Entrant kind** | who plays | `individual` · `fixed_team` · `drawn_team` (redrawn each round) · `free_for_all` |
| **Score kind** | how a result is expressed | `points` · `sets` · `outcome` · `placement` · `time` |
| **Structure** | the shape of the event | `single_elimination` · `double_elimination` · `swiss` · `round_robin` · `groups` · `ladder` |
| **Consolation** | what happens to losers | `none` · `third_place` · `full_consolation` · `repechage` |
| **Pairing** | who plays whom | `seeded` · `random` · `closest_record` · `closest_rating` · `rating_spread` · `berger` |
| **Tiebreakers** | who ranks above whom | an ordered, reorderable list you control |

Compose them and you get real formats without writing code:

- **Pétanque concours** — `closest_record` pairing, `full_consolation`, points capped at 13,
  tiebreakers `[wins, buchholz, point_diff]`. Lose 13–11 to the eventual winner and you still
  outrank someone who beat the last seed.
- **Chess Swiss** — `outcome` scoring with draws, `closest_record` pairing, `[points,
  buchholz, sonneborn_berger]`.
- **Football league** — `round_robin` with two legs and home/away, 3–1–0 points,
  `[points, point_diff, points_for]`, dates and venues on a calendar.
- **Esports** — `double_elimination`, best-of-N sets, Elo carried between events.
- **Mario Kart night** — `free_for_all` entrants, `placement` scoring, `rating_spread` pairing.

Stages chain together, so groups → knockout, league → playoffs, or Swiss → top cut are all just
pipelines.

## Sharing without a server

Bracketeer is a static site on GitHub Pages, so there is nothing to host and nothing to trust.

- **Share link** — the tournament's event log is compressed into the URL. The link is
  self-contained and works forever.
- **Live sync** — the organiser can open a peer-to-peer room so several phones update the same
  tournament in real time.
- **Export** — JSON download, any time.

Honest limitation: peer-to-peer sync introduces peers through public third-party relays and only
works while at least one participant has the page open. Some restrictive networks block it. The
share link and the JSON export are the durable copies of your tournament — treat live sync as a
convenience, not as storage.

## Ratings

Elo by default, with a configurable K-factor, optional margin-of-victory weighting and a rating
floor. Glicko-2 and a TrueSkill-style system for teams and free-for-alls are selectable per
tournament. Or turn ratings off entirely.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # engine unit + property tests
pnpm typecheck
pnpm build
```

The repository is a pnpm workspace:

```
packages/engine   pure TypeScript — formats, pairing, standings, ratings, scheduling.
                  No DOM, no React, no network. This is where the rules live.
apps/web          Vite + React + Tailwind. Rendering and interaction only.
examples/         Composed configurations, as data rather than code.
```

The engine is event-sourced: a tournament's state is a pure function of an append-only log, which
is what makes URL sharing compact, peer merges deterministic, and undo free.

## Contributing

Issues and pull requests are welcome. New sports do not need engine changes — if a format cannot be
expressed by composing the six axes, that gap in the model is itself worth an issue.

## License

MIT
