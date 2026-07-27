/**
 * The claim that a link made here opens over there.
 *
 * The engine takes compression as an argument, so the browser supplies `fflate`
 * and this package supplies `node:zlib`. Both emit a zlib stream, which is why
 * this works — but "both emit a zlib stream" is a fact about two libraries, not
 * something the type system checks, and it is exactly the sort of fact that is
 * true right up until a version bump. So each side decodes the other's output.
 *
 * If this file fails, a tournament run from a conversation can no longer be
 * handed to the people playing it, which is the only reason the CLI exists.
 */

import { encodeLog, decodeLog, type Compressor, type EventLog } from "@bracketeer/engine";
import { deflateSync, inflateSync } from "fflate";
import { describe, expect, it } from "vitest";
import { compressor as node, decode, encode } from "../src/codec.js";
import * as ops from "../src/ops.js";

/** Exactly what `apps/web/src/lib/codec.ts` hands the engine. */
const browser: Compressor = {
  deflate: (bytes) => deflateSync(bytes, { level: 9 }),
  inflate: (bytes) => inflateSync(bytes),
};

/** Every link is `…#/t/:id?d=<log>&…`, so the payload is what follows `d=`. */
function payloadOf(url: string): string {
  return url.split("d=")[1]?.split("&")[0] ?? "";
}

function playedTournament(): EventLog {
  let { log } = ops.create({
    name: "Round trip",
    shape: "all-play-all",
    entrants: ["Marie", "Luc", "Ana", "Paul"],
    seed: 7,
    actor: "test",
  });

  log = ops.start(log, { actor: "test" }).log;

  for (let guard = 0; guard < 20; guard += 1) {
    const ready = ops.listMatches(log, { only: "ready" });
    if (ready.length === 0) {
      const moved = ops.advance(log, { actor: "test" });
      if (!moved.result.moved) break;
      log = moved.log;
      continue;
    }
    for (const match of ready) {
      log = ops.report(log, { match: match.id, score: "13-7", actor: "test" }).log;
    }
  }

  return log;
}

describe("a link crossing between Node and the browser", () => {
  const log = playedTournament();

  it("decodes here what the browser encoded", () => {
    const fromBrowser = encodeLog(log, browser);
    expect(decode(fromBrowser)).toEqual([...log]);
  });

  it("decodes in the browser what was encoded here", () => {
    const fromNode = encode(log);
    expect(decodeLog(fromNode, browser)).toEqual([...log]);
  });

  /*
   * Not byte-identical, and it does not need to be: two DEFLATE implementations
   * are free to choose different encodings of the same data. What has to hold is
   * that either side can read the other, which the two tests above assert.
   */
  it("agrees on the content, whichever side compressed it", () => {
    expect(decodeLog(encode(log), browser)).toEqual(decode(encodeLog(log, browser)));
  });

  it("compresses raw, with no zlib wrapper", () => {
    // The bug this pins: `zlib.deflateSync` and `fflate.deflateSync` have the
    // same name and different formats. A zlib stream starts 0x78; raw DEFLATE
    // does not. Swapping the pairing back makes every shared link unreadable.
    expect(node.deflate(new TextEncoder().encode("x".repeat(200)))[0]).not.toBe(0x78);
  });

  it("round-trips through this package's own compressor", () => {
    const bytes = new TextEncoder().encode("the quick brown fox".repeat(50));
    expect(node.inflate(node.deflate(bytes))).toEqual(bytes);
  });
});

describe("what a link carries", () => {
  const config = {
    entrantFields: [
      { key: "club", label: "Club", private: false },
      { key: "phone", label: "Phone" },
    ],
  };

  function withPrivateData(): EventLog {
    const created = ops.create({
      name: "Club night",
      config,
      entrants: ["Marie"],
      seed: 1,
      actor: "test",
    });
    return ops.updateEntrant(created.log, {
      entrant: "Marie",
      meta: { club: "North", phone: "0612345678" },
      actor: "test",
    }).log;
  }

  it("leaves private fields out of a watch link entirely", () => {
    const log = withPrivateData();
    const { url } = ops.link(log, { id: "abc", audience: "watch" });
    const carried = JSON.stringify(decode(url.split("d=")[1]!.split("&")[0]!));

    expect(carried).not.toContain("0612345678");
    expect(carried).not.toContain("phone");
    expect(carried).toContain("North");
  });

  it("keeps them in an organiser link, which is who that link is for", () => {
    const log = withPrivateData();
    const { url } = ops.link(log, { id: "abc", audience: "run", writeKey: "k123" });
    const carried = JSON.stringify(decode(url.split("d=")[1]!.split("&")[0]!));

    expect(carried).toContain("0612345678");
    expect(url).toContain("&k=k123");
  });

  it("never puts a key on a watch link, even when one is passed", () => {
    const { url } = ops.link(withPrivateData(), {
      id: "abc",
      audience: "watch",
      writeKey: "k123",
    });
    expect(url).not.toContain("k123");
  });

  it("redacts the same way the browser does, because it is the same function", () => {
    // Not a re-implementation: `logFor` comes from the engine, and the app calls
    // it too. This asserts the CLI has not grown its own idea of "public".
    const log = withPrivateData();
    expect(ops.exportFor(log, "watch")).toEqual([...decode(
      ops.link(log, { id: "abc", audience: "watch" }).url.split("d=")[1]!.split("&")[0]!,
    )]);
  });
});

describe("a private field, filled in and then shared", () => {
  /**
   * The whole round trip, because until `update` existed the value could be
   * defined but never entered — and a privacy guarantee about data nobody can
   * record is not a guarantee, it is a shape.
   */
  function withPhone(): EventLog {
    const { log } = ops.create({
      name: "League night",
      config: {
        entrantFields: [
          { key: "club", label: "Club", private: false },
          { key: "phone", label: "Phone" },
        ],
      },
      entrants: ["Marie", "Luc"],
      seed: 4,
      actor: "test",
    });

    return ops.updateEntrant(log, {
      entrant: "Marie",
      meta: { club: "North", phone: "0612345678" },
      actor: "test",
    }).log;
  }

  it("records the value, so the organiser has it", () => {
    const marie = ops.listEntrants(withPhone()).find((e) => e.name === "Marie");
    expect(marie?.meta.phone).toBe("0612345678");
    expect(marie?.meta.club).toBe("North");
  });

  it("keeps it out of the watch link, and keeps the club in", () => {
    const carried = JSON.stringify(
      decode(payloadOf(ops.link(withPhone(), { id: "x", audience: "watch" }).url)),
    );
    expect(carried).not.toContain("0612345678");
    expect(carried).not.toContain("phone");
    expect(carried).toContain("North");
  });

  it("keeps it in the organiser link, which is who that one is for", () => {
    const carried = JSON.stringify(
      decode(payloadOf(ops.link(withPhone(), { id: "x", audience: "run" }).url)),
    );
    expect(carried).toContain("0612345678");
  });

  it("keeps it out of a watch export too, not only the link", () => {
    expect(JSON.stringify(ops.exportFor(withPhone(), "watch"))).not.toContain("0612345678");
  });
});
