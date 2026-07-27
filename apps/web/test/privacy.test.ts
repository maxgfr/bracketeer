/**
 * Public and private data.
 *
 * Without a server, "private" cannot mean permission — it has to mean absence.
 * These tests hold that distinction, because a claim of privacy that turns out
 * to be a hidden field rather than a missing one is worse than no claim at all.
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
import {
  entrantsWithPrivateData,
  hasPrivateValues,
  privateFieldKeys,
  redactPrivate,
} from "../src/lib/privacy.js";

const config = {
  entrantFields: [
    { key: "club", label: "Club" },
    { key: "phone", label: "Phone", private: true },
    { key: "licence", label: "Licence", private: true },
  ],
};

function log(): EventEnvelope[] {
  const at = 1_700_000_000_000;
  let out: EventEnvelope[] = [];
  const add = (event: Parameters<typeof appendEvent>[2]) => {
    out = appendEvent(out, "t", event, at + out.length);
  };

  add(createTournament({ name: "T", config, seed: 1, createdAt: new Date(at).toISOString() }));
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

describe("marking a field private", () => {
  it("is off unless it is asked for", () => {
    expect(privateFieldKeys(parseConfig({ entrantFields: [{ key: "club", label: "Club" }] }))).toEqual(
      [],
    );
  });

  it("lists the fields the organiser marked", () => {
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

  it("keeps everything that was not marked", () => {
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

  it("does nothing at all when no field is private", () => {
    expect(redactPrivate(log(), [])).toEqual(log());
  });

  it("catches a value set by a later edit, not only one set at entry", () => {
    // Ben's number arrives in an update event, which is the easy one to miss.
    const carried = JSON.stringify(redactPrivate(log(), secret));
    expect(carried).not.toContain("0799887766");
  });
});

describe("telling the organiser what will be removed", () => {
  const secret = privateFieldKeys(parseConfig(config));

  it("knows whether there is anything to remove", () => {
    expect(hasPrivateValues(log(), secret)).toBe(true);
    expect(hasPrivateValues(log(), [])).toBe(false);
  });

  it("says nothing will be removed when the fields are empty", () => {
    const at = 1_700_000_000_000;
    let empty: EventEnvelope[] = appendEvent(
      [],
      "t",
      createTournament({ name: "T", config, seed: 1, createdAt: new Date(at).toISOString() }),
      at,
    );
    empty = appendEvent(empty, "t", addEntrant({ id: "a", name: "Ana", meta: { club: "N" } }), at + 1);

    expect(hasPrivateValues(empty, secret)).toBe(false);
  });

  it("counts the entrants affected, so the warning can be specific", () => {
    expect(entrantsWithPrivateData(log(), secret).sort()).toEqual(["a", "b"]);
  });
});
