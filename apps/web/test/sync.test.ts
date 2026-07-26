/**
 * Live sync, proved rather than assumed.
 *
 * This is the one feature that cannot be verified by reasoning about the code:
 * it depends on two independent peers finding each other over infrastructure
 * nobody here controls. So the app's real session runs on one side and a second
 * *process* runs on the other — Trystero identifies a peer by a module-level
 * `selfId`, so two sessions inside one process can never see each other, and a
 * test that tried would prove nothing while looking convincing.
 *
 * Skipped unless RUN_P2P_TESTS is set: it needs the network, and CI should not
 * fail because a public relay had a bad minute.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addEntrant,
  appendEvent,
  createTournament,
  mergeLogs,
  replay,
  startStage,
  type DomainEvent,
  type EventEnvelope,
  type EventLog,
} from "@bracketeer/engine";
import { describe, expect, it } from "vitest";
import { RTCPeerConnection } from "werift";
import { openSession, SYNC_ACTION, SYNC_APP_ID } from "../src/sync/PeerBar.js";

const live = process.env.RUN_P2P_TESTS ? describe : describe.skip;
const workerPath = resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/peer-worker.mjs");

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await settle(250);
  }
  return false;
}

/** The other device, in its own process so it has its own peer identity. */
function spawnPeer(roomId: string, payloadToSend = "") {
  const child: ChildProcess = spawn(
    process.execPath,
    [workerPath, roomId, SYNC_APP_ID, SYNC_ACTION, payloadToSend],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const events: { event: string; data: string }[] = [];
  child.stdout?.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(Boolean)) {
      try {
        events.push(JSON.parse(line));
      } catch {
        /* not one of ours */
      }
    }
  });

  return {
    events,
    received: () => events.filter((e) => e.event === "received").map((e) => e.data),
    saw: (event: string) => events.some((e) => e.event === event),
    stop: () => child.kill("SIGTERM"),
  };
}

function buildTournament(): EventEnvelope[] {
  let log: EventLog = [];
  const at = 1_700_000_000_000;
  const add = (event: DomainEvent) => {
    log = appendEvent(log, "organiser", event, at + log.length);
  };

  add(
    createTournament({
      name: "Club Open",
      config: { score: { kind: "points", target: 13 } },
      seed: 42,
      createdAt: new Date(at).toISOString(),
    }),
  );
  for (const name of ["Marie", "Luc", "Ana", "Paul"]) {
    add(addEntrant({ id: name.toLowerCase(), name }));
  }
  for (const event of startStage(replay(log), "main")) add(event);

  return log as EventEnvelope[];
}

live("live sync between two devices", () => {
  it(
    "sends the whole tournament to a device that joins later",
    async () => {
      const room = `bracketeer-test-${Date.now()}-${process.pid}`;
      let log = buildTournament();
      const errors: string[] = [];
      let peerCount = 0;

      const session = await openSession(room, {
        readLog: () => log,
        onIncoming: (incoming) => {
          log = mergeLogs(log, incoming) as EventEnvelope[];
        },
        onPeerCount: (n) => {
          peerCount = n;
        },
        onError: (message) => errors.push(message),
        rtcPolyfill: RTCPeerConnection,
      });

      const other = spawnPeer(room);

      try {
        const connected = await waitFor(() => peerCount > 0 && other.saw("peer-join"), 45_000);
        expect(connected, `peers never met (errors: ${errors.join("; ")})`).toBe(true);

        const gotIt = await waitFor(() => other.received().length > 0, 30_000);
        expect(gotIt, "the joining device never received the tournament").toBe(true);

        // What arrived must replay to the same tournament.
        const delivered = JSON.parse(other.received()[0] as string) as EventLog;
        expect(replay(delivered).name).toBe("Club Open");
        expect(replay(delivered).entrants).toHaveLength(4);
        expect(replay(delivered)).toEqual(replay(log));
      } finally {
        other.stop();
        session.leave();
      }
    },
    120_000,
  );

  it(
    "takes in a score entered on the other device",
    async () => {
      const room = `bracketeer-score-${Date.now()}-${process.pid}`;
      let log = buildTournament();
      const state = replay(log);
      const match = state.matches.find((m) => m.status === "ready");
      expect(match).toBeTruthy();

      // The other device reports a result the moment it sees us.
      const theirLog = appendEvent(
        log,
        "scorer",
        { type: "result_reported", matchId: match!.id, result: { kind: "points", scores: [13, 7] } },
        Date.now(),
      );

      const errors: string[] = [];
      const session = await openSession(room, {
        readLog: () => log,
        onIncoming: (incoming) => {
          log = mergeLogs(log, incoming) as EventEnvelope[];
        },
        onPeerCount: () => {},
        onError: (message) => errors.push(message),
        rtcPolyfill: RTCPeerConnection,
      });

      const other = spawnPeer(room, JSON.stringify(theirLog));

      try {
        const arrived = await waitFor(
          () => replay(log).matches.some((m) => m.id === match!.id && m.result !== null),
          60_000,
        );
        expect(arrived, `the score never arrived (errors: ${errors.join("; ")})`).toBe(true);
        expect(replay(log).matches.find((m) => m.id === match!.id)?.status).toBe("complete");
      } finally {
        other.stop();
        session.leave();
      }
    },
    120_000,
  );
});

describe("log merging, which is what makes sync safe", () => {
  it("converges no matter which device saw what first", () => {
    const base = appendEvent(
      [],
      "a",
      createTournament({
        name: "T",
        config: {},
        seed: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
      1000,
    );

    const alice = appendEvent(base, "alice", addEntrant({ id: "x", name: "X" }), 2000);
    const bob = appendEvent(base, "bob", addEntrant({ id: "y", name: "Y" }), 2001);

    expect(replay(mergeLogs(alice, bob))).toEqual(replay(mergeLogs(bob, alice)));
    expect(replay(mergeLogs(alice, bob)).entrants).toHaveLength(2);
  });

  it("absorbing the same log twice changes nothing", () => {
    const log = buildTournament();
    expect(mergeLogs(log, log)).toEqual(log);
  });
});

live("the share-link flow", () => {
  it(
    "brings a device that opened a stale link fully up to date",
    async () => {
      const room = `bracketeer-stale-${Date.now()}-${process.pid}`;

      // What the organiser has now.
      let current = buildTournament();
      const state = replay(current);
      const played = state.matches.filter((m) => m.status === "ready").slice(0, 2);
      for (const match of played) {
        current = appendEvent(
          current,
          "organiser",
          { type: "result_reported", matchId: match.id, result: { kind: "points", scores: [13, 5] } },
          Date.now(),
        ) as EventEnvelope[];
      }

      // What a link pasted into a chat an hour ago carries: no results at all.
      const stale = buildTournament();
      expect(replay(stale).matches.every((m) => m.result === null)).toBe(true);

      let organiserLog = current;
      const errors: string[] = [];

      const session = await openSession(room, {
        readLog: () => organiserLog,
        onIncoming: (incoming) => {
          organiserLog = mergeLogs(organiserLog, incoming) as EventEnvelope[];
        },
        onPeerCount: () => {},
        onError: (message) => errors.push(message),
        rtcPolyfill: RTCPeerConnection,
      });

      // The other device joins holding only the stale snapshot.
      const other = spawnPeer(room, JSON.stringify(stale));

      try {
        const gotIt = await waitFor(() => other.received().length > 0, 45_000);
        expect(gotIt, `nothing reached the joining device (${errors.join("; ")})`).toBe(true);

        // What it receives carries the results the stale link did not have.
        const delivered = JSON.parse(other.received()[0] as string) as EventLog;
        const merged = replay(mergeLogs(stale, delivered));
        expect(merged.matches.filter((m) => m.result !== null)).toHaveLength(played.length);

        // And the organiser is not knocked backwards by the stale snapshot.
        expect(replay(organiserLog).matches.filter((m) => m.result !== null)).toHaveLength(
          played.length,
        );
      } finally {
        other.stop();
        session.leave();
      }
    },
    120_000,
  );
});
