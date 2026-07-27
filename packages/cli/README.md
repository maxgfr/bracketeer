# bracketeer-cli

Run a tournament from a terminal, or from a conversation.

```bash
npx bracketeer-cli new --sport petanque --entrants "Marie,Luc,Ana,Paul"
npx bracketeer-cli status <id>      # says the one thing to do next
npx bracketeer-cli start <id>
npx bracketeer-cli report <id> "Marie v Luc" --score "13-7"
npx bracketeer-cli standings <id>
npx bracketeer-cli link <id>        # a watch link that opens in the web app
```

`bracketeer help` lists everything. Every command takes `--json`.

## As a library

The same engine, importable — ESM or CommonJS, with types.

```ts
import { createTournament, addEntrant, appendEvent, replay, startStage } from "bracketeer-cli";
import { findExample } from "bracketeer-cli/presets";

let log = appendEvent([], "me", createTournament({
  name: "Club night",
  config: findExample("knockout")!.config,
  seed: 7,
  createdAt: new Date().toISOString(),
}), Date.now());

log = appendEvent(log, "me", addEntrant({ id: "ana", name: "Ana" }), Date.now());

const state = replay(log);        // state is a fold over the log
```

Commands return events, you append them, and the state falls out of `replay`.
Nothing mutates, so undo is dropping an event, two devices replaying the same log
reach identical state, and correcting a score three rounds back fixes every
standing and rating after it.

The engine knows nothing about any sport. A sport is a point in a configuration
space made of six independent axes — see `parseConfig`, which is the contract,
and note that `parseConfig({})` already gives you a runnable tournament.

`logFor(log, config, "watch")` is the redaction the app and the CLI both use:
it returns the log with every private entrant field *removed*, values and column
definitions alike.

Tournaments are files in `~/.bracketeer` (override with `BRACKETEER_HOME`), written
in the same format the web app imports, so a tournament can start here and finish
on a phone.

## Sharing

`link` gives a **watch** link by default: results and tables, with private entrant
fields absent rather than hidden. `--for run --key <secret>` gives an organiser
link, which lets whoever opens it enter scores — send that only to people helping
run the event.

## As an MCP server

`bracketeer-mcp` speaks MCP over stdio and offers the same operations as tools:

```json
{
  "mcpServers": {
    "bracketeer": {
      "command": "npx",
      "args": ["-y", "--package=bracketeer-cli", "bracketeer-mcp"]
    }
  }
}
```

`--package` is needed because this package ships more than one binary and npx would
otherwise run the CLI.

## For agents

There is a skill that teaches an agent to drive this:

```bash
npx skills add maxgfr/bracketeer
```

Part of [Bracketeer](https://github.com/maxgfr/bracketeer). MIT.
