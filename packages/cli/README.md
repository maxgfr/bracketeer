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
