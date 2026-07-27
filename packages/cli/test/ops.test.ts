/**
 * The operations both front ends drive.
 *
 * The emphasis is on the two places a conversation actually goes wrong: writing
 * a score in whatever notation came to mind, and naming a fixture by the people
 * in it rather than by an id nobody has seen.
 */

import { parseConfig, replay, type EventLog } from "@bracketeer/engine";
import { describe, expect, it } from "vitest";
import * as ops from "../src/ops.js";

function started(shape = "knockout", names = ["Marie", "Luc", "Ana", "Paul"]): EventLog {
  const { log } = ops.create({ shape, entrants: names, seed: 7, actor: "test" });
  return ops.start(log, { actor: "test" }).log;
}

describe("reading a score somebody typed", () => {
  const points = parseConfig({ score: { kind: "points", target: 13 } }).score;

  it.each([
    ["13-7", [13, 7]],
    ["13–7", [13, 7]],
    ["13:7", [13, 7]],
    ["13 - 7", [13, 7]],
    ["13 x 7", [13, 7]],
  ])("reads %s the same way", (input, expected) => {
    expect(ops.parseScore(points, input)).toEqual({ kind: "points", scores: expected });
  });

  it("reads sets as a list of them", () => {
    const sets = parseConfig({ score: { kind: "sets", bestOf: 3 } }).score;
    expect(ops.parseScore(sets, "11-9,9-11,11-6")).toEqual({
      kind: "sets",
      sets: [
        [11, 9],
        [9, 11],
        [11, 6],
      ],
    });
  });

  it("reads a bare winner, and a draw", () => {
    const outcome = parseConfig({ score: { kind: "outcome" } }).score;
    expect(ops.parseScore(outcome, "1")).toEqual({ kind: "outcome", winner: 0 });
    expect(ops.parseScore(outcome, "draw")).toEqual({ kind: "outcome", winner: null });
  });

  it("reads finishing places as one tier per position", () => {
    const placement = parseConfig({ score: { kind: "placement" } }).score;
    // Side 1 came second, side 2 first, side 3 third.
    expect(ops.parseScore(placement, "2,1,3")).toEqual({
      kind: "placement",
      places: [[1], [0], [2]],
    });
  });

  it("reads times, and lets somebody not finish", () => {
    const time = parseConfig({ score: { kind: "time" } }).score;
    expect(ops.parseScore(time, "10.2,11.4")).toEqual({ kind: "time", times: [10.2, 11.4] });
    expect(ops.parseScore(time, "10.2,dnf")).toEqual({ kind: "time", times: [10.2, null] });
  });

  it("says what it wanted rather than guessing", () => {
    expect(() => ops.parseScore(points, "hello")).toThrow(/13-7/);
  });
});

describe("naming a fixture the way people do", () => {
  it("finds one by the two entrants in it", () => {
    const log = started();
    const ready = ops.listMatches(log, { only: "ready" });
    const [a, b] = ready[0]!.sides.map((s) => s.entrant!);

    expect(ops.resolveMatch(replay(log), `${a} v ${b}`).id).toBe(ready[0]!.id);
    expect(ops.resolveMatch(replay(log), `${a} vs ${b}`).id).toBe(ready[0]!.id);
  });

  it("still takes the id, which is what a script will use", () => {
    const log = started();
    const first = ops.listMatches(log, { only: "ready" })[0]!;
    expect(ops.resolveMatch(replay(log), first.id).id).toBe(first.id);
  });

  it("points at the list rather than failing silently", () => {
    expect(() => ops.resolveMatch(replay(started()), "nobody v nobody")).toThrow(/No entrant/);
  });
});

describe("running one through", () => {
  it("says what to do next at every point", () => {
    const fresh = ops.create({ shape: "knockout", entrants: [], seed: 7, actor: "test" });
    expect(ops.status(fresh.log).next).toMatch(/Add entrants/);

    const withPeople = ops.addEntrants(fresh.log, {
      names: ["Marie", "Luc", "Ana", "Paul"],
      actor: "test",
    }).log;
    expect(ops.status(withPeople).next).toMatch(/Start the stage/);

    const open = ops.start(withPeople, { actor: "test" }).log;
    expect(ops.status(open).next).toMatch(/Report 2 results/);
  });

  it("reports waiting rather than erroring when results are outstanding", () => {
    const outcome = ops.advance(started(), { actor: "test" });
    expect(outcome.result.moved).toBe(false);
    expect(outcome.result.note).toMatch(/Waiting on 2/);
  });

  it("carries a result through to the next round", () => {
    let log = started();
    for (const match of ops.listMatches(log, { only: "ready" })) {
      log = ops.report(log, { match: match.id, score: "13-7", actor: "test" }).log;
    }

    expect(ops.advance(log, { actor: "test" }).result.moved).toBe(false);
    // A knockout feeds itself, so the final is ready without an explicit advance.
    const final = ops.listMatches(log, { only: "ready" });
    expect(final).toHaveLength(1);
    expect(final[0]!.sides.every((s) => s.entrant !== null)).toBe(true);
  });

  it("undoes the last change made by this actor", () => {
    let log = started();
    const before = log.length;
    log = ops.report(log, {
      match: ops.listMatches(log, { only: "ready" })[0]!.id,
      score: "13-7",
      actor: "test",
    }).log;

    expect(ops.undo(log, "test").log.length).toBe(before);
  });

  it("keeps a withdrawn entrant's played matches in the record", () => {
    const log = ops.setEntrantStatus(started(), {
      entrant: "Marie",
      status: "withdrawn",
      actor: "test",
    }).log;

    expect(ops.listEntrants(log).find((e) => e.name === "Marie")?.status).toBe("withdrawn");
    expect(ops.listMatches(log).length).toBeGreaterThan(0);
  });
});

describe("choosing a starting point", () => {
  it("resolves a shape by id", () => {
    expect(ops.resolveStart({ shape: "all-play-all" }).config).toBeTruthy();
  });

  it("resolves a sport to its first format when no format is named", () => {
    const start = ops.resolveStart({ sport: "petanque" });
    expect(start.name).toMatch(/—/);
    expect(parseConfig(start.config)).toBeTruthy();
  });

  it("says where to look when the name is wrong", () => {
    expect(() => ops.resolveStart({ shape: "quidditch" })).toThrow(/bracketeer shapes/);
    expect(() => ops.resolveStart({ sport: "quidditch" })).toThrow(/bracketeer sports/);
  });

  it("offers every shape with something to show for it", () => {
    for (const shape of ops.listShapes()) {
      expect(shape.name).toBeTruthy();
      expect(shape.summary).toBeTruthy();
    }
    expect(ops.listShapes().length).toBeGreaterThan(10);
  });
});

/**
 * The operations a coverage gate found nothing was calling.
 *
 * Each is reachable from the CLI, the MCP server, or both. Untested, they were
 * nine commands that a user could run and nothing said whether they worked.
 */
describe("correcting what has already been recorded", () => {
  function played() {
    let log = started();
    const first = ops.listMatches(log, { only: "ready" })[0]!;
    log = ops.report(log, { match: first.id, score: "13-7", actor: "test" }).log;
    return { log, matchId: first.id };
  }

  it("clears a result, and the fixture is playable again", () => {
    const { log, matchId } = played();
    expect(ops.listMatches(log).find((m) => m.id === matchId)?.status).toBe("complete");

    const after = ops.clearResult(log, { match: matchId, actor: "test" });
    expect(after.result.match).toBe(matchId);
    expect(ops.listMatches(after.log).find((m) => m.id === matchId)?.status).toBe("ready");
  });

  it("voids a fixture with a reason, and restores it", () => {
    const { log, matchId } = played();

    const voided = ops.voidMatch(log, { match: matchId, reason: "abandoned", actor: "test" });
    expect(ops.listMatches(voided.log).find((m) => m.id === matchId)?.status).toBe("void");

    const restored = ops.restoreMatch(voided.log, { match: matchId, actor: "test" });
    expect(ops.listMatches(restored.log).find((m) => m.id === matchId)?.status).not.toBe("void");
  });

  it("removes somebody entered by mistake", () => {
    const log = ops.create({
      shape: "knockout",
      entrants: ["Marie", "Luc", "Ana", "Typo"],
      seed: 3,
      actor: "test",
    }).log;

    const after = ops.removeEntrant(log, { entrant: "Typo", actor: "test" });
    expect(after.result.id).toBe("typo");
    expect(ops.listEntrants(after.log).map((e) => e.name)).not.toContain("Typo");
  });
});

describe("ratings", () => {
  it("are derived from the matches, not stored", () => {
    let log = ops.create({
      shape: "all-play-all",
      config: { rating: { system: "elo" } },
      entrants: ["Marie", "Luc", "Ana", "Paul"],
      seed: 2,
      actor: "test",
    }).log;
    log = ops.start(log, { actor: "test" }).log;
    for (const match of ops.listMatches(log, { only: "ready" })) {
      log = ops.report(log, { match: match.id, score: "13-7", actor: "test" }).log;
    }

    const table = ops.ratings(log);
    expect(table).toHaveLength(4);
    expect(table[0]!.rating).toBeGreaterThan(table[table.length - 1]!.rating);
    // Sorted strongest first, which is the only order worth printing.
    expect([...table].sort((a, b) => b.rating - a.rating)).toEqual(table);
  });

  it("are empty rather than undefined before anybody has played", () => {
    expect(ops.ratings(ops.create({ shape: "knockout", seed: 1, actor: "test" }).log)).toEqual([]);
  });
});

describe("the calendar", () => {
  const scheduled = () => {
    const log = started();
    return ops.planTimes(log, { startsAt: "2026-05-01T09:00:00.000Z", actor: "test" });
  };

  it("gives every fixture a time", () => {
    const outcome = scheduled();
    expect(outcome.result.scheduled).toBeGreaterThan(0);
    expect(ops.listMatches(outcome.log).every((m) => m.scheduledAt !== null)).toBe(true);
  });

  it("reports clashes rather than scheduling somebody twice at once", () => {
    // Nobody is double-booked by a plan the scheduler made itself.
    expect(ops.conflicts(scheduled().log)).toEqual([]);
  });

  it("exports something a calendar will actually open", () => {
    const ics = ops.icsOf(scheduled().log);
    expect(ics).toMatch(/^BEGIN:VCALENDAR/);
    expect(ics).toMatch(/END:VCALENDAR\s*$/);
    expect(ics).toContain("BEGIN:VEVENT");
  });
});

describe("the sports list", () => {
  it("offers every sport with at least one format to start from", () => {
    const sports = ops.listSports();
    expect(sports.length).toBeGreaterThan(10);
    for (const sport of sports) {
      expect(sport.name).toBeTruthy();
      expect(sport.formats.length).toBeGreaterThan(0);
      // Each format says which shape it is, because that is the whole claim:
      // a sport is a shape with the scoring filled in, not a mode.
      for (const format of sport.formats) expect(format.basedOn).toBeTruthy();
    }
  });
});
