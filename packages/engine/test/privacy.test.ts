/**
 * Public and private data.
 *
 * Without a server, "private" cannot mean permission — it has to mean absence.
 * These tests hold that distinction, because a claim of privacy that turns out
 * to be a hidden field rather than a missing one is worse than no claim at all.
 */

import { describe, expect, it } from "vitest";
import { addEntrant, createTournament } from "../src/commands/index.js";
import { parseConfig } from "../src/domain/config.js";
import { replay } from "../src/events/reducer.js";
import { appendEvent, type EventEnvelope } from "../src/events/types.js";
import {
  entrantsWithPrivateData,
  hasPrivateValues,
  logFor,
  privateFieldKeys,
  redactPrivate,
  roomIdFor,
} from "../src/privacy/index.js";

const config = {
  entrantFields: [
    { key: "club", label: "Club", private: false },
    { key: "phone", label: "Phone" },
    { key: "licence", label: "Licence" },
  ],
};

const AT = 1_700_000_000_000;
const CREATED = "2023-11-14T22:13:20.000Z";

function log(): EventEnvelope[] {
  let out: EventEnvelope[] = [];
  const add = (event: Parameters<typeof appendEvent>[2]) => {
    out = appendEvent(out, "t", event, AT + out.length);
  };

  add(createTournament({ name: "T", config, seed: 1, createdAt: CREATED }));
  add(
    addEntrant({
      id: "a",
      name: "Ana",
      meta: { club: "North", phone: "0612345678", licence: "L-9931" },
    }),
  );
  add(addEntrant({ id: "b", name: "Ben", meta: { club: "South" } }));
  add({ type: "entrant_updated", id: "b", patch: { meta: { club: "South", phone: "0799887766" } } });
  return out;
}

describe("what a field is by default", () => {
  it("keeps a new field to the organiser until they publish it", () => {
    // The organiser who adds "Phone" and shares a link before finding the
    // checkbox is the case this default exists for.
    const only = parseConfig({ entrantFields: [{ key: "phone", label: "Phone" }] });
    expect(privateFieldKeys(only)).toEqual(["phone"]);
  });

  it("publishes a field that says so", () => {
    const only = parseConfig({
      entrantFields: [{ key: "club", label: "Club", private: false }],
    });
    expect(privateFieldKeys(only)).toEqual([]);
  });

  it("lists exactly the fields that were not published", () => {
    expect(privateFieldKeys(parseConfig(config))).toEqual(["phone", "licence"]);
  });
});

describe("redacting for a public link", () => {
  const secret = privateFieldKeys(parseConfig(config));

  it("removes the value entirely rather than blanking or masking it", () => {
    const carried = JSON.stringify(redactPrivate(log(), secret));

    expect(carried).not.toContain("0612345678");
    expect(carried).not.toContain("0799887766");
    expect(carried).not.toContain("L-9931");
    // Not replaced with a placeholder either: the key is gone.
    expect(carried).not.toContain("phone");
    expect(carried).not.toContain("licence");
  });

  it("keeps everything that was published", () => {
    const state = replay(redactPrivate(log(), secret));
    expect(state.entrants.map((e) => e.name)).toEqual(["Ana", "Ben"]);
    expect(state.entrants[0]?.meta.club).toBe("North");
    expect(state.entrants[1]?.meta.club).toBe("South");
  });

  it("leaves the tournament otherwise identical, so results are unaffected", () => {
    const full = replay(log());
    const public_ = replay(redactPrivate(log(), secret));

    expect(public_.matches).toEqual(full.matches);
    expect(public_.name).toBe(full.name);
    expect(public_.entrants).toHaveLength(full.entrants.length);
  });

  it("does nothing at all when every field is published", () => {
    expect(redactPrivate(log(), [])).toEqual(log());
  });

  it("catches a value set by a later edit, not only one set at entry", () => {
    // Ben's number arrives in an update event, which is the easy one to miss.
    const carried = JSON.stringify(redactPrivate(log(), secret));
    expect(carried).not.toContain("0799887766");
  });
});

describe("the copy an audience gets", () => {
  const parsed = parseConfig(config);

  it("gives someone watching a log with nothing private in it", () => {
    expect(JSON.stringify(logFor(log(), parsed, "watch"))).not.toContain("0612345678");
  });

  it("gives someone helping run it everything", () => {
    expect(logFor(log(), parsed, "run")).toEqual(log());
  });

  it("redacts by default when the organiser never touched the fields", () => {
    // No field says `private: false`, so nothing should reach a spectator.
    const bare = parseConfig({ entrantFields: [{ key: "phone", label: "Phone" }] });
    let out: EventEnvelope[] = appendEvent(
      [],
      "t",
      createTournament({ name: "T", config: { entrantFields: [{ key: "phone", label: "Phone" }] }, seed: 1, createdAt: CREATED }),
      AT,
    );
    out = appendEvent(out, "t", addEntrant({ id: "a", name: "Ana", meta: { phone: "0612345678" } }), AT + 1);

    expect(JSON.stringify(logFor(out, bare, "watch"))).not.toContain("0612345678");
  });
});

describe("telling the organiser what will be removed", () => {
  const secret = privateFieldKeys(parseConfig(config));

  it("knows whether there is anything to remove", () => {
    expect(hasPrivateValues(log(), secret)).toBe(true);
    expect(hasPrivateValues(log(), [])).toBe(false);
  });

  it("says nothing will be removed when the fields are empty", () => {
    let empty: EventEnvelope[] = appendEvent(
      [],
      "t",
      createTournament({ name: "T", config, seed: 1, createdAt: CREATED }),
      AT,
    );
    empty = appendEvent(empty, "t", addEntrant({ id: "a", name: "Ana", meta: { club: "N" } }), AT + 1);

    expect(hasPrivateValues(empty, secret)).toBe(false);
  });

  it("counts the entrants affected, so the warning can be specific", () => {
    expect(entrantsWithPrivateData(log(), secret).sort()).toEqual(["a", "b"]);
  });
});

describe("the room live sync meets in", () => {
  it("cannot be worked out from the tournament id, which every link carries", async () => {
    const room = await roomIdFor("s3cret-write-key");
    expect(room).not.toContain("s3cret-write-key");
    // A spectator holds the id and the encoded log; neither gets them here.
    expect(room).not.toContain("abc123");
  });

  it("is the same room for the same key, so two organisers actually meet", async () => {
    expect(await roomIdFor("k")).toBe(await roomIdFor("k"));
  });

  it("is a different room for a different key", async () => {
    expect(await roomIdFor("one")).not.toBe(await roomIdFor("two"));
  });

  it("is url-safe, because it goes on the wire as a room name", async () => {
    expect(await roomIdFor("k")).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
