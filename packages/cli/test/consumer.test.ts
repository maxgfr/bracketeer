/**
 * The package as somebody else receives it.
 *
 * Every other test in this repo imports TypeScript source through a bundler,
 * which is exactly the condition under which this package was broken for
 * months: `@bracketeer/engine` shipped `.ts` files whose imports said `.js`, so
 * it worked here and threw `ERR_MODULE_NOT_FOUND` anywhere else.
 *
 * Building it did not settle the question either. The first three attempts at a
 * declaration build all reported success and emitted types that re-exported
 * `@bracketeer/engine` — a package no consumer can resolve. The build was green
 * and the package was unusable.
 *
 * So these tests read `dist/`, the way an installed copy would: the ESM entry by
 * `import()`, the CJS entry by `require()`, and the declarations through a real
 * `tsc` run. Nothing here touches `src/`.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const dist = join(pkgRoot, "dist");
const require_ = createRequire(import.meta.url);

/** The public API, as the two module systems each see it. */
type Api = typeof import("../src/lib.js");

const esm = (await import(join(dist, "index.js"))) as Api;
const cjs = require_(join(dist, "index.cjs")) as Api;

/** Play a whole tournament using only what the entry point exposes. */
function playThrough(api: Api): { winner: string; played: number } {
  const at = 1_700_000_000_000;
  let log = api.appendEvent(
    [],
    "consumer",
    api.createTournament({
      name: "From outside",
      config: { stages: [{ kind: "single_elimination", id: "main" }] },
      seed: 7,
      createdAt: "2023-11-14T22:13:20.000Z",
    }),
    at,
  );

  ["Marie", "Luc", "Ana", "Paul"].forEach((name, i) => {
    log = api.appendEvent(
      log,
      "consumer",
      api.addEntrant({ id: name.toLowerCase(), name, seed: i + 1 }),
      at + i + 1,
    );
  });

  // startStage returns several events — the stage opening and the round it drew.
  for (const event of api.startStage(api.replay(log), "main")) {
    log = api.appendEvent(log, "consumer", event, at + 10 + log.length);
  }

  for (let guard = 0; guard < 20; guard += 1) {
    const state = api.replay(log);
    const ready = state.matches.filter((m) => m.status === "ready");
    if (ready.length === 0) break;
    for (const match of ready) {
      log = api.appendEvent(
        log,
        "consumer",
        api.reportResult(match.id, { kind: "points", scores: [13, 7] }),
        at + 100 + log.length,
      );
    }
  }

  const final = api.replay(log);
  const table = api.stageStandings(final, "main");
  return {
    winner: final.entrants.find((e) => e.id === table[0]?.entrantId)?.name ?? "",
    played: final.matches.filter((m) => m.status === "complete").length,
  };
}

describe.each([
  ["ESM, via import()", esm],
  ["CJS, via require()", cjs],
])("%s", (_label, api) => {
  it("runs a tournament to a winner", () => {
    expect(playThrough(api)).toEqual({ winner: "Marie", played: 3 });
  });

  it("reports the published version, not one typed into the source", () => {
    const { version } = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
    expect(api.VERSION).toBe(version);
  });

  it("carries the redaction, which is the part that must not be left behind", () => {
    const config = api.parseConfig({ entrantFields: [{ key: "phone", label: "Phone" }] });
    expect(api.privateFieldKeys(config)).toEqual(["phone"]);
  });

  it("validates a configuration rather than trusting it", () => {
    expect(() => api.parseConfig({ stages: [{ kind: "not_a_format" }] })).toThrow();
  });
});

it("gives both module systems the same answer", () => {
  expect(playThrough(esm)).toEqual(playThrough(cjs));
});

it("offers the presets on their own entry point", async () => {
  const presets = (await import(join(dist, "presets.js"))) as typeof import("../src/presets.js");
  expect(presets.EXAMPLES.length).toBeGreaterThan(10);
  expect(presets.findExample("knockout")).toBeDefined();
  expect(presets.SPORTS.some((s) => s.formats.length > 0)).toBe(true);
});

/* ────────────────────────────────────────────────────────────────────────────
 * The declarations, compiled the way a consumer's editor would
 * ──────────────────────────────────────────────────────────────────────────── */

const scratch = mkdtempSync(join(tmpdir(), "bracketeer-consumer-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Type-check a snippet against `dist/*.d.ts`, returning tsc's complaints. */
function typeCheck(source: string): string {
  writeFileSync(join(scratch, "usage.ts"), source);
  writeFileSync(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: [],
        // Resolve the package by its real name, from its real entry points, so
        // this fails exactly when an installed copy would.
        paths: {
          "bracketeer-cli": [join(dist, "index.d.ts")],
          "bracketeer-cli/presets": [join(dist, "presets.d.ts")],
        },
      },
      files: ["usage.ts"],
    }),
  );

  try {
    execFileSync(require_.resolve("typescript/bin/tsc"), ["-p", scratch], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return "";
  } catch (cause) {
    const failure = cause as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
  }
}

describe("the types an editor would load", () => {
  it("resolves the whole public surface, with no dangling package reference", () => {
    // This is the regression. The build happily emitted
    // `export * from "@bracketeer/engine"` three times over — green, and broken
    // for everyone but this repo.
    expect(readFileSync(join(dist, "index.d.ts"), "utf8")).not.toContain("@bracketeer/");
    expect(readFileSync(join(dist, "presets.d.ts"), "utf8")).not.toContain("@bracketeer/");
  });

  it("type-checks ordinary use", () => {
    expect(
      typeCheck(`
        import { createTournament, addEntrant, appendEvent, replay, parseConfig } from "bracketeer-cli";
        import { findExample } from "bracketeer-cli/presets";

        const config = parseConfig(findExample("knockout")!.config);
        let log = appendEvent([], "me", createTournament({
          name: "T", config, seed: 1, createdAt: "2023-11-14T22:13:20.000Z",
        }), 1);
        log = appendEvent(log, "me", addEntrant({ id: "a", name: "Ana" }), 2);
        const name: string = replay(log).name;
        void name;
      `),
    ).toBe("");
  });

  it("still rejects what should be rejected, so the types are not just `any`", () => {
    // A declaration file that resolves but erases everything to `any` would pass
    // the test above and help nobody.
    expect(typeCheck(`
      import { addEntrant } from "bracketeer-cli";
      addEntrant({ id: "a" });
    `)).toMatch(/name/);

    expect(typeCheck(`
      import { replay } from "bracketeer-cli";
      const n: number = replay([]).name;
      void n;
    `)).toMatch(/not assignable|string/);
  });
});
