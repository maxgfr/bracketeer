/**
 * What live sync puts on the wire.
 *
 * This is the guarantee the whole sync design rests on: **the organiser key is
 * never sent as data**. The room is a one-way function of it, so everybody who
 * got in already holds it — and a message carrying it would hand it to anyone
 * who found the room by other means, which is precisely the bug this replaced.
 *
 * It was previously asserted only inside the two-process peer test, which is
 * skipped unless `RUN_P2P_TESTS` is set. CI never sets it. So the most important
 * privacy claim in the app was checked by nothing on any commit. These tests need
 * no network, no relay and no second browser, and run on every push.
 */

import {
  addEntrant,
  appendEvent,
  createTournament,
  roomIdFor,
  type EventLog,
} from "@bracketeer/engine";
import { describe, expect, it } from "vitest";
import { logFromWire, SYNC_WIRE_VERSION, wireEnvelope } from "../src/sync/PeerBar.js";

const KEY = "s3cret-organiser-key";
const TOURNAMENT_ID = "abc123xyz";

function log(): EventLog {
  const at = 1_700_000_000_000;
  let out: EventLog = appendEvent(
    [],
    "organiser",
    createTournament({
      name: "Club night",
      config: { entrantFields: [{ key: "phone", label: "Phone" }] },
      seed: 3,
      createdAt: "2023-11-14T22:13:20.000Z",
    }),
    at,
  );
  return appendEvent(
    out,
    "organiser",
    addEntrant({ id: "marie", name: "Marie", meta: { phone: "0612345678" } }),
    at + 1,
  );
}

describe("the envelope a peer broadcasts", () => {
  it("does not carry the organiser key", () => {
    // The regression, stated as plainly as it can be: an earlier version sent
    // `{ k: writeKey, log }` to every peer in the room.
    expect(wireEnvelope(log())).not.toContain(KEY);
  });

  it("carries nothing but a version and a log", () => {
    const parsed = JSON.parse(wireEnvelope(log())) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["log", "v"]);
    expect(parsed.v).toBe(SYNC_WIRE_VERSION);
  });

  it("round-trips a log unchanged, or sync would corrupt what it syncs", () => {
    expect(logFromWire(wireEnvelope(log()))).toEqual(log());
  });
});

describe("what a peer accepts off the wire", () => {
  it("ignores a payload from an older protocol rather than misreading it", () => {
    // This is what a peer still running the version that leaked the key sends.
    const old = JSON.stringify({ k: KEY, log: log() });
    expect(logFromWire(old)).toBeNull();
  });

  it("ignores a future version too", () => {
    expect(logFromWire(JSON.stringify({ v: SYNC_WIRE_VERSION + 1, log: log() }))).toBeNull();
  });

  it("survives rubbish without throwing, so one bad peer cannot take the tab down", () => {
    for (const payload of ["", "not json", "null", "[]", "{}", '{"v":2}', '{"v":2,"log":"nope"}']) {
      expect(() => logFromWire(payload)).not.toThrow();
      expect(logFromWire(payload)).toBeNull();
    }
  });
});

describe("the room peers meet in", () => {
  it("cannot be derived from the tournament id, which every watch link carries", async () => {
    const room = await roomIdFor(KEY);
    expect(room).not.toContain(TOURNAMENT_ID);
    expect(room).not.toBe(TOURNAMENT_ID);
    expect(room).not.toContain(KEY);
  });

  it("is the same for the same key and different for another", async () => {
    expect(await roomIdFor(KEY)).toBe(await roomIdFor(KEY));
    expect(await roomIdFor(KEY)).not.toBe(await roomIdFor(`${KEY}x`));
  });
});
