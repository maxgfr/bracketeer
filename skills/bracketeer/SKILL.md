---
name: bracketeer
description: Use when someone wants to run a competition — a tournament, bracket, league, ladder, poule, knockout, round robin, Swiss event, club night or games night — and needs the draw made, fixtures listed, scores recorded, standings and tiebreaks worked out, ratings tracked, or a link to share with players and spectators. Also for questions like "what format should I use for 11 people", "how many rounds for 32", "who is top on countback", "make me a bracket", or "seed these teams". Works for any sport or game, and for none.
---

# Running a tournament

Bracketeer runs competitions without knowing what any sport is. You drive it
through a CLI, and it holds the tournament as a file you can hand to a browser
at any point.

**Do not compute a draw, a pairing, or a standings table yourself.** Swiss
pairing, tiebreak order, bye rotation and bracket propagation are all things that
look easy and are not — and a table you worked out by hand cannot be checked,
corrected, or handed over. Every answer comes from the engine.

## Reaching the tool

Try in this order, and use the first that runs:

```bash
bracketeer help                     # already installed
npx -y bracketeer-cli@latest help   # not installed
node packages/cli/dist/cli.mjs help # inside the bracketeer repo, after `pnpm --filter bracketeer build`
```

Tournaments are files in `~/.bracketeer`. Every command takes `--json`, and you
should almost always pass it — the plain output is columns for a human.

There is also an MCP server (`bracketeer-mcp`) exposing the same operations as
tools: `create_tournament`, `add_entrants`, `start_stage`, `list_matches`,
`report_result`, `advance`, `standings`, `share_link` and the rest. If those
tools are already available to you, use them and ignore the shell commands below;
they do the same things through the same code.

## Choosing a structure

**Ask what the event needs, not what the sport is.** There is no sport-specific
behaviour anywhere in the engine — a sport is just a set of settings. Start from
the question the organiser is actually asking:

| They want | Reach for |
|---|---|
| It to be short, losing to matter | `knockout`, `two-lives`, `best-of` |
| Everybody to play the same number of games | `all-play-all`, `season`, `paired-by-record` |
| A big field and a limited afternoon | `paired-by-record`, `wide-field`, `rounds-then-cut` |
| A few games, then a decision | `groups-then-knockout`, `pools-then-knockout` |
| More than two competing at once | `heats`, `timed`, `rotating-partners` |
| Something with no end date | `ladder` |

```bash
bracketeer shapes --json                    # all of them, with what each costs in matches
bracketeer sports --json                    # sports, each a shape with the scoring filled in
bracketeer describe --shape groups-then-knockout --json
```

`describe` plays a sample tournament and reports what actually came out, so use
it to answer "how many rounds will this be" rather than working it out.

Starting from a sport is a shortcut, not a mode: `--sport petanque` is a shape
with the points system and tiebreaks already set. Everything stays editable.

**Sizing, so you can advise rather than guess:** a knockout of N is N−1 matches
and ⌈log₂N⌉ rounds for the winner. Everyone-plays-everyone is N(N−1)/2 matches,
which is 45 for ten people and usually too many. Paired-by-record is ⌈log₂N⌉
rounds whatever N is, which is why it exists. When unsure, run `describe` and
read `matchesEach` from `shapes`.

## Running it

```bash
bracketeer new --sport petanque --name "Club night" --entrants "Marie,Luc,Ana,Paul" --json
bracketeer status <id> --json          # where things are, and what to do next
bracketeer start <id> --json           # make the draw
bracketeer matches <id> --ready --json # exactly what can be played now
bracketeer report <id> "Marie v Luc" --score "13-7" --json
bracketeer advance <id> --json         # pair the next round, or open the next stage
bracketeer standings <id> --json
```

**The loop is: `status` → do what it says → `status`.** `status.next` is a plain
sentence naming the one thing to do, and following it is always right.

Entrants are listed strongest first — that order becomes the seeding. Add more
later with `add`; they join the next stage that has not started yet.

A fixture can be named by its id or by the people in it (`"Marie v Luc"`), which
is what someone will actually say.

**Scores are written the way the tournament scores.** Check `score.kind` if
unsure:

| Kind | Write it as |
|---|---|
| points | `"13-7"` — any of `-` `–` `:` `x` works |
| sets | `"11-9,9-11,11-6"` |
| outcome | `"1"` for the first side, or `"draw"` |
| placement | `"2,1,3"` — side 1 came second, side 2 first, side 3 third |
| time | `"10.2,11.4"`, or `"10.2,dnf"` |

`advance` reporting `moved: false` with "Waiting on 3 results" is **not an
error** — it is the tournament telling you it needs scores. Report them and call
it again.

Got a score wrong three rounds ago? `bracketeer clear <id> <match>` and report it
again. Standings, ratings and every later fixture are re-derived; nothing needs
fixing by hand. `bracketeer undo <id>` drops the last change.

Somebody leaves halfway: `bracketeer withdraw <id> "Marie"`. Their played matches
stay in the record and they are left out of future draws. `remove` is for someone
who was entered by mistake.

## Reading the table

`standings --json` gives rank, record, competition points and the tiebreak
metrics that were applied, in order. **`tiedWithNext: true` means the tiebreakers
could not separate two entrants** — say so plainly rather than picking one. If
the organiser needs a winner regardless, `drawn_lot` is a tiebreaker they can add
and it is reproducible from the seed.

`ratings --json` gives Elo, Glicko-2 or a TrueSkill-style rating, whichever is
configured. Ratings are always recomputed by replaying every match, never stored,
so an old correction fixes everything after it.

## Sharing — read this before sending anybody a link

**`bracketeer link` gives a watch link by default, and that is the one to send.**
It carries results, tables and the calendar. Private entrant fields are *not in
it* — not hidden inside it, absent — so nothing can be read back out.

```bash
bracketeer link <id> --json                        # watch: send this to players and spectators
bracketeer link <id> --for run --key <secret> --json  # organiser: can enter scores
bracketeer export <id> --for watch --out sheet.json   # the copy that lasts
```

Rules to hold to:

- **Send the organiser link only to people helping run the event.** Whoever opens
  it can enter scores for everyone. Never post it to a group of players.
- **Entrant fields are private unless published.** A phone number or a licence
  number added as a custom field stays on the organiser's device. Do not mark a
  field public on someone's behalf — that is the organiser's decision about
  somebody else's data.
- **Never invent a share URL.** Always use the one `link` returned; it contains
  the whole tournament, and a hand-written URL carries nothing.
- If `verdict` comes back `too_long`, the tournament has outgrown a URL. Send the
  exported file instead — say that rather than sending a truncated link.

## What to tell people honestly

- **There is no server and no account.** The tournament lives in the file and in
  the link. If both are lost it is gone, so export after anything important.
- **Live sync is only between organiser links**, works only while somebody has
  the page open, and goes through public relays nobody controls. Some networks
  block it. It is a convenience, never the record.
- **A watch link cannot be un-sent.** Whoever has it keeps a copy of what it
  carried at the moment you sent it.

## When something will not compose

If an organiser wants a structure that cannot be expressed by choosing a shape
and changing settings, say so rather than approximating it quietly. Compass draw
(the eight-bracket tennis format) is the known gap. Approximating a format and
not mentioning it is how somebody finds out mid-tournament.
