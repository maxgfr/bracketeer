/**
 * Where a tournament lives on disk.
 *
 * Untested until a coverage gate went in and reported it at 0%. It is the least
 * interesting file in the package and the most expensive one to get wrong: it is
 * the only durable copy of a tournament somebody is in the middle of running, and
 * the failure mode is silent — a saved file that does not load, discovered when
 * the organiser reopens it in front of a hall.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, createTournament, replay, type EventLog } from "@bracketeer/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { list, load, pathFor, randomId, randomSeed, save, storeDir } from "../src/store.js";

let home: string;
const original = process.env.BRACKETEER_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "bracketeer-store-"));
  process.env.BRACKETEER_HOME = home;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  if (original === undefined) delete process.env.BRACKETEER_HOME;
  else process.env.BRACKETEER_HOME = original;
});

function log(name = "Stored"): EventLog {
  return appendEvent(
    [],
    "test",
    createTournament({ name, config: {}, seed: 1, createdAt: "2023-11-14T22:13:20.000Z" }),
    1_700_000_000_000,
  );
}

describe("choosing where a tournament goes", () => {
  it("honours BRACKETEER_HOME, so tournaments can live beside a project", () => {
    expect(storeDir()).toBe(home);
    expect(pathFor("abc")).toBe(join(home, "abc.json"));
  });

  it("falls back to the home directory when nothing says otherwise", () => {
    delete process.env.BRACKETEER_HOME;
    expect(storeDir()).toMatch(/\.bracketeer$/);
  });

  it("treats anything path-shaped as a path rather than an id", () => {
    // `--file ./somewhere/else.json` has to mean that file, not an id that
    // happens to contain a slash.
    expect(pathFor("./out.json")).toMatch(/out\.json$/);
    expect(pathFor("./out.json")).not.toContain(home);
    expect(pathFor("nested/thing.json")).toMatch(/nested\/thing\.json$/);
  });
});

describe("saving and loading", () => {
  it("round-trips a log through the file", () => {
    save("t1", log("Club night"));
    expect(replay(load("t1")).name).toBe("Club night");
  });

  it("writes the format the web app imports, not something of its own", () => {
    save("t1", log());
    const written = JSON.parse(readFileSync(pathFor("t1"), "utf8")) as Record<string, unknown>;
    // A tournament started here has to be openable there; that interchange is
    // the reason the CLI exists at all.
    expect(written.format).toBe("bracketeer");
    expect(written).toHaveProperty("exportedAt");
    expect(Array.isArray(written.log)).toBe(true);
  });

  it("creates the directory rather than failing on a first run", () => {
    const nested = join(home, "deeper", "still", "t2.json");
    save(nested, log());
    expect(existsSync(nested)).toBe(true);
  });

  it("overwrites in place, because saving is what every command does", () => {
    save("t1", log("First"));
    save("t1", log("Second"));
    expect(replay(load("t1")).name).toBe("Second");
  });

  it("says where it looked when there is nothing there", () => {
    expect(() => load("missing")).toThrow(/No tournament at .*missing\.json/);
    expect(() => load("missing")).toThrow(/bracketeer new/);
  });

  it("refuses a file that is not a tournament rather than returning nonsense", () => {
    writeFileSync(pathFor("junk"), "{ not a tournament }");
    expect(() => load("junk")).toThrow();
  });
});

describe("listing what is on this machine", () => {
  it("is empty, not an error, before anything exists", () => {
    delete process.env.BRACKETEER_HOME;
    process.env.BRACKETEER_HOME = join(home, "never-created");
    expect(list()).toEqual([]);
  });

  it("reports each tournament with the file it came from", () => {
    save("alpha", log());
    save("beta", log());

    const found = list();
    expect(found.map((t) => t.id).sort()).toEqual(["alpha", "beta"]);
    expect(found.every((t) => existsSync(t.file))).toBe(true);
    expect(found.every((t) => !Number.isNaN(Date.parse(t.updatedAt)))).toBe(true);
  });

  it("puts the most recently changed first, since that is the one you meant", () => {
    save("older", log());
    // mtime has second-level granularity on some filesystems, so make the
    // difference unambiguous rather than racing it.
    const past = new Date(Date.now() - 60_000);
    utimesSync(pathFor("older"), past, past);
    save("newer", log());

    expect(list()[0]?.id).toBe("newer");
  });

  it("ignores anything that is not a tournament file", () => {
    save("real", log());
    writeFileSync(join(home, "notes.txt"), "shopping list");
    expect(list().map((t) => t.id)).toEqual(["real"]);
  });
});

describe("the identifiers it mints", () => {
  it("avoids the characters people misread aloud", () => {
    // These get read across a sports hall and written on a whiteboard, so no
    // l/1/0/o to argue about.
    for (let i = 0; i < 200; i += 1) expect(randomId()).toMatch(/^[abcdefghijkmnopqrstuvwxyz23456789]+$/);
  });

  it("is the length asked for, and different every time", () => {
    expect(randomId(6)).toHaveLength(6);
    expect(new Set(Array.from({ length: 500 }, () => randomId())).size).toBe(500);
  });

  it("produces a seed the engine will accept", () => {
    for (let i = 0; i < 50; i += 1) {
      const seed = randomSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
    }
  });
});
