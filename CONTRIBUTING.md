# Contributing

Issues and pull requests are welcome.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # engine + app
pnpm typecheck
pnpm build
```

## Before you add a sport

You probably do not need to. If a format cannot be expressed by composing the six
axes in [docs/CONFIG.md](docs/CONFIG.md), that gap in the *model* is the
interesting thing — open an issue describing the format and what it needs, rather
than adding a branch for it.

New worked examples in `examples/` are always welcome. They are generated from
`apps/web/src/lib/examples.ts`, so add yours there and run `pnpm test`.

## Where things live

```
packages/engine   The rules. Pure TypeScript, no DOM, no network.
apps/web          Rendering and interaction only.
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
- **New scoring goes through `normalizeResult`** and nowhere else.
- **Tests describe behaviour, not implementation.** `"puts the player with three
  narrow losses above the one who only beat the bottom"` is a better test name
  than `"buchholz works"`, and a better test.
- **Say what is uncertain.** If an approximation is used, name it in a comment
  where the reader will meet it.

Run `pnpm test && pnpm typecheck && pnpm build` before opening a pull request.
CI runs the same three.
