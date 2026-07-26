import { deflateSync, inflateSync } from "node:zlib";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decodeLog,
  encodeLog,
  fromBase64Url,
  fromJsonFile,
  toBase64Url,
  toJsonFile,
  urlSizeVerdict,
  type Compressor,
} from "../src/codec/index.js";
import { replay } from "../src/events/reducer.js";
import { bySeed, Driver, names } from "./tournament.js";

/** Node's zlib stands in for the browser's compressor in tests. */
const zlib: Compressor = {
  deflate: (bytes) => new Uint8Array(deflateSync(bytes)),
  inflate: (bytes) => new Uint8Array(inflateSync(bytes)),
};

describe("base64url", () => {
  it("round-trips arbitrary bytes", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 500 }), (bytes) => {
        expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes]);
      }),
      { numRuns: 200 },
    );
  });

  it("produces nothing that needs escaping in a URL", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), (bytes) => {
        expect(toBase64Url(bytes)).toMatch(/^[A-Za-z0-9\-_]*$/);
      }),
      { numRuns: 100 },
    );
  });

  it("handles every input length, including the padding cases", () => {
    for (let length = 0; length < 10; length += 1) {
      const bytes = new Uint8Array(Array.from({ length }, (_, i) => (i * 37) % 256));
      expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes]);
    }
  });
});

describe("encoding a tournament into a link", () => {
  const tournament = () => {
    const driver = new Driver(
      {
        score: { kind: "points", target: 13 },
        stages: [{ kind: "single_elimination", id: "main", consolation: "full_consolation" }],
      },
      names(16),
    );
    driver.runAll(bySeed);
    return driver;
  };

  it("round-trips the log exactly", () => {
    const driver = tournament();
    const decoded = decodeLog(encodeLog(driver.log, zlib), zlib);
    expect(decoded).toEqual(driver.log);
  });

  it("replays to the same tournament on the other side of the link", () => {
    const driver = tournament();
    const decoded = decodeLog(encodeLog(driver.log, zlib), zlib);
    expect(replay(decoded)).toEqual(driver.state);
  });

  it("keeps a real tournament comfortably inside a shareable URL", () => {
    const encoded = encodeLog(tournament().log, zlib);
    // A fully played 16-entrant knockout with a consolation bracket.
    expect(urlSizeVerdict(encoded)).toBe("fine");
    expect(encoded.length).toBeLessThan(4_000);
  });

  it("compresses far below the raw log", () => {
    const driver = tournament();
    const raw = JSON.stringify(driver.log).length;
    expect(encodeLog(driver.log, zlib).length).toBeLessThan(raw / 3);
  });

  it("refuses a log written by a newer version rather than misreading it", () => {
    const forged = toBase64Url(
      zlib.deflate(new TextEncoder().encode(JSON.stringify({ v: 99, a: [], e: [] }))),
    );
    expect(() => decodeLog(forged, zlib)).toThrow(/newer version/);
  });

  it("survives an empty tournament", () => {
    expect(decodeLog(encodeLog([], zlib), zlib)).toEqual([]);
  });
});

describe("file export", () => {
  it("round-trips through JSON", () => {
    const driver = new Driver({ stages: [{ kind: "round_robin", id: "l" }] }, names(4));
    driver.runAll(bySeed);

    const file = toJsonFile(driver.log, "2026-01-01T00:00:00.000Z");
    expect(replay(fromJsonFile(file))).toEqual(driver.state);
  });

  it("is readable rather than packed", () => {
    const file = toJsonFile([], "2026-01-01T00:00:00.000Z");
    expect(file).toContain('"format": "bracketeer"');
    expect(JSON.parse(file)).toMatchObject({ format: "bracketeer", log: [] });
  });

  it("rejects a file that is not a tournament", () => {
    expect(() => fromJsonFile('{"hello":"world"}')).toThrow(/does not look like/);
    expect(() => fromJsonFile("not json at all")).toThrow();
  });
});

describe("URL size budget", () => {
  it("warns before a link gets long enough to be truncated", () => {
    expect(urlSizeVerdict("x".repeat(100))).toBe("fine");
    expect(urlSizeVerdict("x".repeat(10_000))).toBe("long");
    expect(urlSizeVerdict("x".repeat(40_000))).toBe("too_long");
  });

  it("tells the truth about a large tournament", () => {
    const driver = new Driver(
      {
        score: { kind: "points" },
        pairing: { strategy: "closest_record" },
        stages: [{ kind: "swiss", id: "main", rounds: 8 }],
      },
      names(128),
    );
    driver.runAll(bySeed);

    const encoded = encodeLog(driver.log, zlib);
    // 128 entrants over 8 Swiss rounds — a big event, and still a usable link.
    expect(encoded.length).toBeLessThan(30_000);
    expect(replay(decodeLog(encoded, zlib))).toEqual(driver.state);
  });
});
