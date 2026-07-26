import { describe, expect, it } from "vitest";
import { replay } from "../src/events/reducer.js";
import { appendEvent, mergeLogs, undoLast, type EventEnvelope } from "../src/events/types.js";
import { entrant, logOf, match, side } from "./helpers.js";

const created = {
  type: "tournament_created" as const,
  name: "Test Cup",
  seed: 42,
  createdAt: "2026-01-01T10:00:00.000Z",
  config: {},
};

describe("event log", () => {
  it("stamps events with a per-actor sequence and a Lamport clock", () => {
    const log = logOf("alice", [created, { type: "tournament_renamed", name: "Renamed" }]);
    expect(log.map((e) => e.id)).toEqual(["alice:1", "alice:2"]);
    expect(log.map((e) => e.lamport)).toEqual([1, 2]);
  });

  it("orders events identically no matter what order they arrive in", () => {
    const log = logOf("alice", [created, { type: "tournament_renamed", name: "B" }]);
    const shuffled = [...log].reverse();
    expect(replay(shuffled)).toEqual(replay(log));
    expect(replay(shuffled).name).toBe("B");
  });

  it("never lets wall-clock skew decide the outcome", () => {
    // Bob's device has a clock an hour behind, yet his event happened later.
    const base = logOf("alice", [created]);
    const late = appendEvent(base, "bob", { type: "tournament_renamed", name: "Bob's name" }, 0);
    expect(replay(late).name).toBe("Bob's name");
  });
});

describe("merging two peers' logs", () => {
  const base = logOf("alice", [created]);

  const alice = appendEvent(
    base,
    "alice",
    { type: "entrant_added", entrant: entrant("a", { name: "Alice" }) },
    2_000,
  );
  const bob = appendEvent(
    base,
    "bob",
    { type: "entrant_added", entrant: entrant("b", { name: "Bob" }) },
    2_001,
  );

  it("keeps both peers' work", () => {
    const merged = mergeLogs(alice, bob);
    const names = replay(merged).entrants.map((e) => e.name);
    expect(names).toEqual(["Alice", "Bob"]);
  });

  it("reaches the same state regardless of merge order", () => {
    expect(replay(mergeLogs(alice, bob))).toEqual(replay(mergeLogs(bob, alice)));
  });

  it("is idempotent — merging the same log twice changes nothing", () => {
    const once = mergeLogs(alice, bob);
    expect(mergeLogs(once, bob)).toEqual(once);
  });

  it("does not duplicate an entrant that arrives from both peers", () => {
    const both = mergeLogs(alice, alice.slice());
    expect(replay(both).entrants).toHaveLength(1);
  });
});

describe("replay", () => {
  it("applies entrant edits and withdrawals", () => {
    const log = logOf("alice", [
      created,
      { type: "entrant_added", entrant: entrant("a", { name: "Alice" }) },
      { type: "entrant_added", entrant: entrant("b", { name: "Bob" }) },
      { type: "entrant_updated", id: "a", patch: { name: "Alice R.", seed: 1 } },
      { type: "entrant_status_changed", id: "b", status: "withdrawn" },
    ]);

    const state = replay(log);
    expect(state.entrants[0]).toMatchObject({ id: "a", name: "Alice R.", seed: 1 });
    expect(state.entrants[1]?.status).toBe("withdrawn");
  });

  it("ignores an edit to an entrant another peer removed", () => {
    const log = logOf("alice", [
      created,
      { type: "entrant_added", entrant: entrant("a") },
      { type: "entrant_removed", id: "a" },
      { type: "entrant_updated", id: "a", patch: { name: "ghost" } },
    ]);
    expect(replay(log).entrants).toHaveLength(0);
  });

  it("undo drops only this actor's most recent event", () => {
    const log = logOf("alice", [created, { type: "tournament_renamed", name: "Second" }]);
    const withBob = appendEvent(log, "bob", { type: "tournament_renamed", name: "Bob" }, 5_000);
    const undone = undoLast(withBob, "alice");
    expect(undone.map((e: EventEnvelope) => e.id)).toEqual(["alice:1", "bob:1"]);
  });
});

describe("bracket propagation", () => {
  const semi1 = match("s1", [side("a"), side("b")], { roundIndex: 0, order: 0 });
  const semi2 = match("s2", [side("c"), side("d")], { roundIndex: 0, order: 1 });
  const final = match(
    "f",
    [
      side(null, { source: { from: "winner", matchId: "s1" } }),
      side(null, { source: { from: "winner", matchId: "s2" } }),
    ],
    { roundIndex: 1 },
  );
  const third = match(
    "3rd",
    [
      side(null, { source: { from: "loser", matchId: "s1" } }),
      side(null, { source: { from: "loser", matchId: "s2" } }),
    ],
    { roundIndex: 1, bracket: "third_place", order: 1 },
  );

  const setup = [
    created,
    ...["a", "b", "c", "d"].map((id) => ({ type: "entrant_added" as const, entrant: entrant(id) })),
    { type: "round_generated" as const, stageId: "main", roundIndex: 0, matches: [semi1, semi2] },
    { type: "round_generated" as const, stageId: "main", roundIndex: 1, matches: [final, third] },
  ];

  it("leaves downstream fixtures pending until their feeders are played", () => {
    const state = replay(logOf("alice", setup));
    expect(state.matches.find((m) => m.id === "f")?.status).toBe("pending");
    expect(state.matches.find((m) => m.id === "s1")?.status).toBe("ready");
  });

  it("carries winners forward and losers sideways", () => {
    const state = replay(
      logOf("alice", [
        ...setup,
        { type: "result_reported", matchId: "s1", result: { kind: "points", scores: [13, 7] } },
        { type: "result_reported", matchId: "s2", result: { kind: "points", scores: [5, 13] } },
      ]),
    );

    const final = state.matches.find((m) => m.id === "f");
    expect(final?.sides.map((s) => s.entrantId)).toEqual(["a", "d"]);
    expect(final?.status).toBe("ready");

    const third = state.matches.find((m) => m.id === "3rd");
    expect(third?.sides.map((s) => s.entrantId)).toEqual(["b", "c"]);
  });

  it("retracts a propagated entrant when the feeding result is cleared", () => {
    const state = replay(
      logOf("alice", [
        ...setup,
        { type: "result_reported", matchId: "s1", result: { kind: "points", scores: [13, 7] } },
        { type: "result_cleared", matchId: "s1" },
      ]),
    );
    const final = state.matches.find((m) => m.id === "f");
    expect(final?.sides[0]?.entrantId).toBeNull();
    expect(final?.status).toBe("pending");
  });

  it("treats a fixture with one entrant and no feeder as a bye", () => {
    const solo = match("solo", [side("a"), side(null)]);
    const state = replay(
      logOf("alice", [
        created,
        { type: "entrant_added", entrant: entrant("a") },
        { type: "round_generated", stageId: "main", roundIndex: 0, matches: [solo] },
      ]),
    );
    expect(state.matches[0]?.status).toBe("bye");
  });

  it("advances the entrant who received the bye", () => {
    const bye = match("bye", [side("a"), side(null)], { roundIndex: 0 });
    const next = match(
      "next",
      [side(null, { source: { from: "winner", matchId: "bye" } }), side("b")],
      { roundIndex: 1 },
    );
    const state = replay(
      logOf("alice", [
        created,
        { type: "entrant_added", entrant: entrant("a") },
        { type: "entrant_added", entrant: entrant("b") },
        { type: "round_generated", stageId: "main", roundIndex: 0, matches: [bye] },
        { type: "round_generated", stageId: "main", roundIndex: 1, matches: [next] },
      ]),
    );
    expect(state.matches.find((m) => m.id === "next")?.sides[0]?.entrantId).toBe("a");
  });

  it("lets an organiser override a pairing by hand", () => {
    const state = replay(
      logOf("alice", [
        ...setup,
        { type: "result_reported", matchId: "s1", result: { kind: "points", scores: [13, 7] } },
        { type: "match_sides_overridden", matchId: "f", entrantIds: ["b", "c"] },
      ]),
    );
    const final = state.matches.find((m) => m.id === "f");
    // The override must survive propagation — otherwise the engine would
    // immediately overwrite the organiser's decision with the feeder's winner.
    expect(final?.sides.map((s) => s.entrantId)).toEqual(["b", "c"]);
    expect(final?.status).toBe("ready");
  });

  it("excludes a voided fixture from progression", () => {
    const state = replay(
      logOf("alice", [
        ...setup,
        { type: "result_reported", matchId: "s1", result: { kind: "points", scores: [13, 7] } },
        { type: "match_voided", matchId: "s1", reason: "abandoned" },
      ]),
    );
    expect(state.matches.find((m) => m.id === "s1")?.status).toBe("void");
    expect(state.matches.find((m) => m.id === "f")?.sides[0]?.entrantId).toBeNull();
  });

  it("does not retire a fixture whose feeders are still settling", () => {
    // Regression: the final was being voided during propagation because the
    // semi-finals held results while their own slots were still being filled
    // from round one. A slot only counts as permanently empty once occupants
    // have converged.
    const state = replay(
      logOf("alice", [
        ...setup,
        { type: "result_reported", matchId: "s1", result: { kind: "points", scores: [13, 7] } },
        { type: "result_reported", matchId: "s2", result: { kind: "points", scores: [5, 13] } },
      ]),
    );

    const final = state.matches.find((m) => m.id === "f");
    expect(final?.status).toBe("ready");
    expect(final?.sides.map((s) => s.entrantId)).toEqual(["a", "d"]);
    expect(state.matches.every((m) => m.status !== "void")).toBe(true);
  });

  it("discards a round that has not been played", () => {
    const state = replay(
      logOf("alice", [...setup, { type: "round_discarded", stageId: "main", roundIndex: 1 }]),
    );
    expect(state.matches.map((m) => m.id)).toEqual(["s1", "s2"]);
    expect(state.stages).toEqual([]);
  });
});
