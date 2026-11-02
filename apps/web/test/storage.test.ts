import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import type { EventLog } from "@bracketeer/engine";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeStorage,
  forgetTournament,
  initStorage,
  listTournaments,
  loadLog,
  saveLog,
} from "../src/lib/storage.js";

const log = (n: number) => [{ n }] as unknown as EventLog;

afterEach(() => closeStorage());

describe("storage in IndexedDB", () => {
  it("moves tournaments out of localStorage once, and leaves other keys alone", async () => {
    localStorage.setItem("bracketeer.log.a", JSON.stringify(log(1)));
    localStorage.setItem("bracketeer.index", JSON.stringify([{ id: "a", name: "Open", updatedAt: 1, entrants: 4 }]));
    localStorage.setItem("bracketeer.theme", JSON.stringify("dark"));
    localStorage.setItem("other-app.data", "x");
    const factory = new IDBFactory();

    await initStorage(factory);
    expect(loadLog("a")).toEqual(log(1));
    expect(listTournaments().map((t) => t.name)).toEqual(["Open"]);
    expect(localStorage.getItem("bracketeer.log.a")).toBeNull();
    expect(localStorage.getItem("bracketeer.index")).toBeNull();
    expect(localStorage.getItem("bracketeer.theme")).toBe('"dark"');
    expect(localStorage.getItem("other-app.data")).toBe("x");

    // Next start reads it back from IndexedDB.
    closeStorage();
    await initStorage(factory);
    expect(loadLog("a")).toEqual(log(1));
    expect(listTournaments()).toHaveLength(1);
  });

  it("keeps the IndexedDB copy over a stale localStorage one", async () => {
    const factory = new IDBFactory();
    await initStorage(factory);
    expect(await saveLog("a", log(2), { name: "Open", entrants: 4 })).toBe(true);
    closeStorage();

    localStorage.setItem("bracketeer.log.a", JSON.stringify(log(1)));
    await initStorage(factory);
    expect(loadLog("a")).toEqual(log(2));
    expect(localStorage.getItem("bracketeer.log.a")).toBeNull();
  });

  it("leaves unreadable entries where they are", async () => {
    localStorage.setItem("bracketeer.log.bad", "{not json");
    await initStorage(new IDBFactory());
    expect(loadLog("bad")).toBeNull();
    expect(localStorage.getItem("bracketeer.log.bad")).toBe("{not json");
  });

  it("saves, lists and forgets", async () => {
    const factory = new IDBFactory();
    await initStorage(factory);
    await saveLog("a", log(1), { name: "A", entrants: 2 });
    await saveLog("b", log(2), { name: "B", entrants: 3 });
    forgetTournament("a");
    closeStorage();
    await initStorage(factory);
    expect(listTournaments().map((t) => t.id)).toEqual(["b"]);
    expect(loadLog("a")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("reports a write the browser refuses", async () => {
    await initStorage(new IDBFactory());
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = () => {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    };
    try {
      expect(await saveLog("a", log(1), { name: "A", entrants: 2 })).toBe(false);
    } finally {
      IDBObjectStore.prototype.put = put;
    }
    // Still there for this session.
    expect(loadLog("a")).toEqual(log(1));
  });

  it("stays on localStorage when IndexedDB cannot open", async () => {
    const broken = {
      open: () => {
        throw new Error("blocked");
      },
    } as unknown as IDBFactory;
    await initStorage(broken);
    expect(await saveLog("a", log(1), { name: "A", entrants: 2 })).toBe(true);
    expect(localStorage.getItem("bracketeer.log.a")).toBe(JSON.stringify(log(1)));
    await initStorage(undefined);
    expect(listTournaments().map((t) => t.id)).toEqual(["a"]);
  });
});
