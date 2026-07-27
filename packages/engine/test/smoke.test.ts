/**
 * The barrel is the package's public surface, and it is what gets bundled into
 * the published library. A missing re-export is invisible in this repo — every
 * other test imports from a deep path — and breaks only for whoever installed it.
 *
 * There is deliberately no version assertion here. The engine used to export a
 * `VERSION` typed into the source, and a test that read it back proved only that
 * two constants matched each other. The real version is substituted at build
 * time from package.json and checked in `packages/cli/test/consumer.test.ts`.
 */

import { describe, expect, it } from "vitest";
import * as engine from "../src/index.js";

describe("what the engine offers", () => {
  it.each([
    // The event-sourcing contract: commands make events, replay folds them.
    "createTournament",
    "addEntrant",
    "reportResult",
    "startStage",
    "advanceStage",
    "replay",
    "appendEvent",
    "mergeLogs",
    "undoLast",
    // The rules.
    "parseConfig",
    "normalizeResult",
    "computeStandings",
    "computeRatings",
    "pairRound",
    "planSchedule",
    // Sharing, and what a spectator may see.
    "encodeLog",
    "decodeLog",
    "logFor",
    "redactPrivate",
    "roomIdFor",
    // Reading a structure by playing it.
    "readShape",
  ])("exports %s", (name) => {
    expect(engine[name as keyof typeof engine]).toBeTypeOf("function");
  });

  it("makes a runnable tournament out of nothing", () => {
    // `parseConfig({})` filling in every default is the promise that a caller
    // only has to write the deltas they care about.
    expect(engine.parseConfig({}).stages).toHaveLength(1);
  });
});
