import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodeLog } from "../src/codec/index.js";
import { findConflicts, planSchedule, scheduleEvents, toIcs } from "../src/schedule/index.js";
import { bySeed, Driver, names } from "./tournament.js";

const schedule = {
  startsAt: "2026-06-01T09:00:00.000Z",
  matchDurationMinutes: 45,
  breakBetweenRoundsMinutes: 15,
  venues: [
    { id: "p1", name: "Piste 1", capacity: 1 },
    { id: "p2", name: "Piste 2", capacity: 1 },
  ],
};

function scheduled(entrants = 8) {
  const driver = new Driver(
    {
      score: { kind: "points", target: 13 },
      schedule,
      stages: [{ kind: "single_elimination", id: "main" }],
    },
    names(entrants),
  );
  driver.start("main");
  const plan = planSchedule(driver.state.matches, driver.state.config.schedule);
  driver.apply(scheduleEvents(plan));
  return driver;
}

describe("planning a schedule", () => {
  it("runs as many fixtures at once as there are pistes", () => {
    const driver = scheduled(8);
    const firstRound = driver.state.matches.filter((m) => m.roundIndex === 0);
    const times = new Set(firstRound.map((m) => m.scheduledAt));
    // Four fixtures over two pistes: two waves.
    expect(times.size).toBe(2);
    expect(new Set(firstRound.map((m) => m.venueId))).toEqual(new Set(["p1", "p2"]));
  });

  it("starts a round only after the one before it has finished", () => {
    const driver = scheduled(8);
    const latestFirst = Math.max(
      ...driver.state.matches
        .filter((m) => m.roundIndex === 0)
        .map((m) => new Date(m.scheduledAt as string).getTime()),
    );
    const earliestSecond = Math.min(
      ...driver.state.matches
        .filter((m) => m.roundIndex === 1)
        .map((m) => new Date(m.scheduledAt as string).getTime()),
    );
    expect(earliestSecond).toBeGreaterThan(latestFirst);
  });

  it("leaves the configured break between rounds", () => {
    const driver = scheduled(4);
    const times = driver.state.matches
      .filter((m) => m.scheduledAt)
      .map((m) => new Date(m.scheduledAt as string).getTime())
      .sort((a, b) => a - b);
    const first = times[0] as number;
    const final = times[times.length - 1] as number;
    // Two semis on two pistes at once, then 45 minutes of play plus a 15 break.
    expect((final - first) / 60_000).toBe(60);
  });

  it("does not put a walkover on a piste", () => {
    const driver = scheduled(5);
    const byes = driver.state.matches.filter((m) => m.status === "bye");
    expect(byes.length).toBeGreaterThan(0);
    expect(byes.every((m) => m.scheduledAt === null)).toBe(true);
  });

  it("plans nothing when there is no start time", () => {
    expect(planSchedule([], { ...schedule, startsAt: null })).toEqual([]);
  });
});

describe("conflicts", () => {
  it("finds none in a plan it made itself", () => {
    expect(findConflicts(scheduled(8).state)).toEqual([]);
  });

  it("reports an entrant booked into two fixtures at once", () => {
    const driver = scheduled(8);
    const [a, b] = driver.state.matches.filter((m) => m.roundIndex === 0);
    if (!a || !b) throw new Error("expected two fixtures");

    // Move the second onto the first's slot, so somebody is in two places.
    driver.apply([
      { type: "match_scheduled", matchId: b.id, scheduledAt: a.scheduledAt, venueId: "p2" },
      { type: "match_sides_overridden", matchId: b.id, entrantIds: [a.sides[0]?.entrantId ?? null, "p07"] },
    ]);

    const conflicts = findConflicts(driver.state);
    expect(conflicts.some((c) => c.kind === "entrant_double_booked")).toBe(true);
  });

  it("reports a venue asked to host more than it can", () => {
    const driver = scheduled(8);
    const [a, b] = driver.state.matches.filter((m) => m.roundIndex === 0);
    if (!a || !b) throw new Error("expected two fixtures");

    driver.apply([
      { type: "match_scheduled", matchId: b.id, scheduledAt: a.scheduledAt, venueId: a.venueId },
    ]);

    const conflicts = findConflicts(driver.state);
    expect(conflicts.some((c) => c.kind === "venue_over_capacity")).toBe(true);
  });
});

describe("calendar export", () => {
  it("produces a valid-looking iCalendar feed", () => {
    const ics = toIcs(scheduled(4).state);

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).toContain("VERSION:2.0");
    // CRLF endings are required by the specification.
    expect(ics.split("\r\n").length).toBeGreaterThan(10);
  });

  it("has one event per playable fixture, named after the entrants", () => {
    const driver = scheduled(4);
    const ics = toIcs(driver.state);
    const events = ics.match(/BEGIN:VEVENT/g) ?? [];

    expect(events).toHaveLength(3); // two semis and a final
    expect(ics).toContain("SUMMARY:p01 v p04");
    expect(ics).toContain("LOCATION:Piste 1");
  });

  it("gives every event a start, an end and a unique identifier", () => {
    const ics = toIcs(scheduled(4).state);
    expect((ics.match(/DTSTART:/g) ?? []).length).toBe(3);
    expect((ics.match(/DTEND:/g) ?? []).length).toBe(3);
    expect(new Set(ics.match(/UID:[^\r]+/g) ?? []).size).toBe(3);
  });

  it("escapes text that would otherwise break the format", () => {
    const driver = new Driver(
      { schedule, stages: [{ kind: "round_robin", id: "l" }] },
      ["Ana; Bob", "Carla, Dee"],
    );
    driver.start("l");
    const plan = planSchedule(driver.state.matches, driver.state.config.schedule);
    driver.apply(scheduleEvents(plan));

    const ics = toIcs(driver.state);
    expect(ics).toContain("Ana\\; Bob");
    expect(ics).toContain("Carla\\, Dee");
  });

  it("skips fixtures that have no date yet", () => {
    const driver = new Driver({ stages: [{ kind: "round_robin", id: "l" }] }, names(4));
    driver.start("l");
    expect(toIcs(driver.state)).not.toContain("BEGIN:VEVENT");
  });
});

describe("a scheduled tournament still fits in a link", () => {
  it("stays small once every fixture carries a date and a venue", () => {
    const driver = scheduled(16);
    driver.runAll(bySeed);
    const encoded = encodeLog(driver.log, {
      deflate: (bytes) => new Uint8Array(deflateSync(bytes)),
      inflate: () => new Uint8Array(),
    });
    expect(encoded.length).toBeLessThan(8_000);
  });
});
