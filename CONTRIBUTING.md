# Contributing

Issues and pull requests are welcome.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # engine + presets + cli + app
pnpm typecheck
pnpm build
```

## Commit messages decide the version

Releases are cut automatically from the commit history, so the message is not
paperwork — it is the input that picks the next version number. A commit-msg hook
checks it, and CI checks it again on pull requests.

```
feat: draw a bracket for the losers' side       → minor  0.2.0
fix: stop a bye counting as a win               → patch  0.1.1
feat!: rename the --for flag to --audience      → major  1.0.0
docs: explain the pairing constraints           → no release
```

Types that release nothing — `docs`, `chore`, `refactor`, `test`, `style`,
`build`, `ci`, `perf` — are the right answer for a change nobody installing the
package would notice. A breaking change is a `!` after the type, or a
`BREAKING CHANGE:` footer explaining what somebody has to do differently.

The scope is optional and free-form; `feat(cli):` and `fix(engine):` read well.

Merging to `main` runs typecheck, tests, both coverage gates and the build, and
only then publishes to npm and opens a GitHub release. Nothing is published by
hand.

## Before you add a sport

You probably do not need to. If a format cannot be expressed by composing the six
axes in [docs/CONFIG.md](docs/CONFIG.md), that gap in the *model* is the
interesting thing — open an issue describing the format and what it needs, rather
than adding a branch for it.

New worked examples in `examples/` are always welcome. They are generated from
`packages/presets/src/examples.ts`, so add yours there and run `pnpm test`.

## Where things live

```
packages/engine   The rules. Pure TypeScript, no DOM, no network.
packages/presets  Shapes and sports, as data. They live here and not in the engine
                  because the engine must never contain the name of a sport.
packages/cli      The `bracketeer` command and the MCP server.
apps/web          Rendering and interaction only.
skills/           The agent skill. `.claude/skills/bracketeer` is a symlink to it,
                  so there is one copy to keep current. On Windows, clone with
                  `git config core.symlinks true` or copy the directory instead.
examples/         Configurations, as data.
docs/             CONFIG.md is the reference; DESIGN.md is the why.
```

The engine has one dependency (`zod`) and should keep it that way. Compression is
injected by the host rather than imported, for exactly this reason.

## What a good change looks like

- **The engine stays sport-agnostic.** No `if (sport === …)`, ever.
- **Nothing calls `Math.random()` or reads the clock inside the engine.** Two
  devices replaying the same log must reach identical state; a random draw that
  differs between them silently forks a tournament.
- **New scoring goes through `normalizeResult`** and nowhere else. That holds for
  writing a result as well as reading one — `nominalResult` is in the same file for
  that reason.
- **Private is the default, and sharing is the deliberate act.** Anything that
  leaves the device goes through `logFor`. If you find yourself writing a second
  answer to "what may a spectator see", that is the bug.
- **If you change the CLI, run its skill test.** `packages/cli/test/skill.test.ts`
  holds `skills/bracketeer/SKILL.md` to the code, because a skill that has drifted
  gets followed confidently.
- **Tests describe behaviour, not implementation.** `"puts the player with three
  narrow losses above the one who only beat the bottom"` is a better test name
  than `"buchholz works"`, and a better test.
- **Say what is uncertain.** If an approximation is used, name it in a comment
  where the reader will meet it.

Run `pnpm test && pnpm typecheck && pnpm build` before opening a pull request.
CI runs the same three.
