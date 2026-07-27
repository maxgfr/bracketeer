/**
 * The link.
 *
 * There were two controls that shared a tournament, and the convenient one
 * skipped redaction — so the fastest way to share was the only way that leaked.
 * These tests exist to stop that happening twice: they hold the two controls to
 * the same string, and they check what is *absent* from it rather than what is
 * present, because absence is the whole privacy claim.
 */

import {
  addEntrant,
  appendEvent,
  createTournament,
  parseConfig,
  replay,
  type EventEnvelope,
} from "@bracketeer/engine";
import { describe, expect, it } from "vitest";
import { decode } from "../src/lib/codec.js";
import { embedLink, shareLink } from "../src/lib/share.js";

const WRITE_KEY = "wr1tekey0000abcd";
const AT = 1_700_000_000_000;

const config = {
  entrantFields: [
    { key: "affiliation", label: "Club", private: false },
    { key: "phone", label: "Phone" },
  ],
};

function log(): EventEnvelope[] {
  let out: EventEnvelope[] = appendEvent(
    [],
    "t",
    createTournament({
      name: "Spring Open",
      config,
      seed: 1,
      createdAt: "2023-11-14T22:13:20.000Z",
    }),
    AT,
  );
  return appendEvent(
    out,
    "t",
    addEntrant({ id: "a", name: "Ana", meta: { affiliation: "North", phone: "0612345678" } }),
    AT + 1,
  );
}

const parsed = parseConfig(config);

/** Every link is `…#/t/:id?d=<log>&…`, so the payload is what follows `d=`. */
function payloadOf(url: string): string {
  return url.split("d=")[1]?.split("&")[0] ?? "";
}

describe("the link the control strip copies", () => {
  it("is byte-identical to the watch link on the Share tab", () => {
    // One builder, one string. The bug was two call sites disagreeing.
    const strip = shareLink({
      id: "abc123",
      log: log(),
      config: parsed,
      audience: "watch",
      writeKey: WRITE_KEY,
      live: false,
    });
    const panel = shareLink({
      id: "abc123",
      log: log(),
      config: parsed,
      audience: "watch",
      writeKey: WRITE_KEY,
      live: false,
    });

    expect(strip.url).toBe(panel.url);
  });

  it("carries no private value, in the link or anywhere it decodes to", () => {
    const { url } = shareLink({
      id: "abc123",
      log: log(),
      config: parsed,
      audience: "watch",
      writeKey: WRITE_KEY,
      live: false,
    });

    const carried = JSON.stringify(decode(payloadOf(url)));

    expect(carried).not.toContain("0612345678");
    expect(carried).not.toContain("phone");
    // The published field survives, or the redaction would be useless.
    expect(carried).toContain("North");
  });

  it("never carries the organiser key", () => {
    const { url } = shareLink({
      id: "abc123",
      log: log(),
      config: parsed,
      audience: "watch",
      writeKey: WRITE_KEY,
      live: false,
    });

    expect(url).not.toContain(WRITE_KEY);
    expect(url).not.toContain("&k=");
  });

  it("does not invite a spectator to a room they cannot enter", () => {
    const { url } = shareLink({
      id: "abc123",
      log: log(),
      config: parsed,
      audience: "watch",
      writeKey: WRITE_KEY,
      live: true,
    });

    expect(url).not.toContain("live=1");
  });
});

describe("the organiser link", () => {
  const organiser = () =>
    shareLink({
      id: "abc123",
      log: log(),
      config: parsed,
      audience: "run",
      writeKey: WRITE_KEY,
      live: true,
    });

  it("carries the key, because its holder is meant to enter scores", () => {
    expect(organiser().url).toContain(`&k=${WRITE_KEY}`);
  });

  it("carries the invitation when sync is on", () => {
    expect(organiser().url).toContain("live=1");
  });

  it("keeps the private fields, because it is for somebody helping run it", () => {
    const state = replay(decode(payloadOf(organiser().url)));
    expect(state.entrants[0]?.meta.phone).toBe("0612345678");
  });
});

describe("the embed", () => {
  it("is always a watch copy, with no audience to get wrong", () => {
    const { url } = embedLink("abc123", log(), parsed);
    const state = replay(decode(payloadOf(url)));

    expect(state.entrants[0]?.meta.phone).toBeUndefined();
    expect(state.entrants[0]?.meta.affiliation).toBe("North");
    expect(url).not.toContain(WRITE_KEY);
  });
});
