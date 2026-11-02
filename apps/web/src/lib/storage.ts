/**
 * Local persistence.
 *
 * There is no server, so the browser is the only durable copy a tournament has
 * until somebody exports it or shares the link. Every write is defensive:
 * private browsing and a full quota both throw, and losing a score entry to an
 * exception thrown by the *storage* layer would be the worst possible failure.
 *
 * Event logs grow with every score, and maxgfr.github.io serves many apps from
 * one origin that share a single localStorage quota of about 5 MB. So logs and
 * the list of tournaments live in IndexedDB; only small settings stay in
 * localStorage. `initStorage` opens the database and loads it into memory before
 * the first render, so reads stay synchronous; each write updates memory at once
 * and resolves to whether the browser actually stored it.
 */

import type { EventLog } from "@bracketeer/engine";

const INDEX_KEY = "bracketeer.index";
const LOG_PREFIX = "bracketeer.log.";
const ACTOR_KEY = "bracketeer.actor";
const THEME_KEY = "bracketeer.theme";

export const DB_NAME = "bracketeer";
const LOGS = "logs";
const META = "meta";

export interface StoredTournament {
  id: string;
  name: string;
  updatedAt: number;
  /** Entrant count, so the list can be useful without replaying every log. */
  entrants: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** The database and its content in memory, once `initStorage` has opened it. */
let db: { handle: IDBDatabase; index: StoredTournament[]; logs: Map<string, EventLog> } | null = null;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** One transaction over both stores; false when the browser refused it. */
async function transact(run: (logs: IDBObjectStore, meta: IDBObjectStore) => void): Promise<boolean> {
  if (!db) return false;
  try {
    const tx = db.handle.transaction([LOGS, META], "readwrite");
    run(tx.objectStore(LOGS), tx.objectStore(META));
    await done(tx);
    return true;
  } catch {
    return false;
  }
}

/** Tournaments an earlier version left in localStorage (unreadable entries are left where they are). */
function legacyTournaments(): { index: StoredTournament[]; logs: Map<string, EventLog> } {
  const logs = new Map<string, EventLog>();
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LOG_PREFIX)) keys.push(key);
    }
  } catch {
    return { index: [], logs };
  }
  for (const key of keys) {
    const log = readJson<EventLog | null>(key, null);
    if (Array.isArray(log)) logs.set(key.slice(LOG_PREFIX.length), log);
  }
  const index = readJson<unknown>(INDEX_KEY, []);
  return { index: Array.isArray(index) ? (index as StoredTournament[]) : [], logs };
}

/**
 * Opens the database and moves anything left in localStorage into it, once.
 * Without IndexedDB (or when it fails to open) storage stays on localStorage.
 */
export async function initStorage(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<void> {
  if (db || !factory) return;
  let handle: IDBDatabase;
  let index: StoredTournament[];
  const logs = new Map<string, EventLog>();
  try {
    const open = factory.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore(LOGS);
      open.result.createObjectStore(META);
    };
    handle = await request(open);
  } catch {
    return;
  }
  try {
    const tx = handle.transaction([LOGS, META], "readonly");
    const [ids, values, stored] = await Promise.all([
      request(tx.objectStore(LOGS).getAllKeys()),
      request(tx.objectStore(LOGS).getAll()),
      request(tx.objectStore(META).get(INDEX_KEY)),
    ]);
    ids.forEach((key, i) => logs.set(String(key), values[i] as EventLog));
    index = Array.isArray(stored) ? (stored as StoredTournament[]) : [];
  } catch {
    handle.close();
    return;
  }
  db = { handle, index, logs };

  const legacy = legacyTournaments();
  if (legacy.logs.size === 0) return;
  // A log already in IndexedDB is the newer copy: the leftover is only removed.
  const moved = [...legacy.logs].filter(([id]) => !logs.has(id));
  for (const [id, log] of moved) logs.set(id, log);
  const known = new Set(db.index.map((t) => t.id));
  db.index = [...db.index, ...legacy.index.filter((t) => !known.has(t.id) && logs.has(t.id))];
  const next = db.index;
  const ok = await transact((logStore, meta) => {
    for (const [id, log] of moved) logStore.put(log, id);
    meta.put(next, INDEX_KEY);
  });
  // The old keys are this app's own: removed only once IndexedDB holds a copy.
  if (ok) {
    for (const key of [...[...legacy.logs.keys()].map((id) => `${LOG_PREFIX}${id}`), INDEX_KEY]) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* retried on the next start */
      }
    }
  }
}

/** Closes the database and forgets what was loaded (tests). */
export function closeStorage(): void {
  db?.handle.close();
  db = null;
}

export function listTournaments(): StoredTournament[] {
  const index = db ? db.index : readJson<StoredTournament[]>(INDEX_KEY, []);
  return [...index].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadLog(id: string): EventLog | null {
  if (db) return db.logs.get(id) ?? null;
  return readJson<EventLog | null>(`${LOG_PREFIX}${id}`, null);
}

/** Resolves to false when the browser refused to store it (private mode, full quota). */
export async function saveLog(
  id: string,
  log: EventLog,
  summary: Omit<StoredTournament, "id" | "updatedAt">,
): Promise<boolean> {
  const entry = { id, updatedAt: Date.now(), ...summary };
  if (db) {
    db.logs.set(id, log);
    db.index = [...db.index.filter((t) => t.id !== id), entry];
    const index = db.index;
    return transact((logs, meta) => {
      logs.put(log, id);
      meta.put(index, INDEX_KEY);
    });
  }
  const ok = writeJson(`${LOG_PREFIX}${id}`, log);
  if (!ok) return false;
  const index = readJson<StoredTournament[]>(INDEX_KEY, []).filter((t) => t.id !== id);
  index.push(entry);
  return writeJson(INDEX_KEY, index);
}

export function forgetTournament(id: string): void {
  if (db) {
    db.logs.delete(id);
    db.index = db.index.filter((t) => t.id !== id);
    const index = db.index;
    void transact((logs, meta) => {
      logs.delete(id);
      meta.put(index, INDEX_KEY);
    });
    return;
  }
  try {
    localStorage.removeItem(`${LOG_PREFIX}${id}`);
  } catch {
    /* nothing we can do, and nothing worth interrupting the user for */
  }
  writeJson(
    INDEX_KEY,
    readJson<StoredTournament[]>(INDEX_KEY, []).filter((t) => t.id !== id),
  );
}

/**
 * This device's identity in the event log.
 *
 * Stable across sessions so a returning organiser's events continue their own
 * sequence rather than starting a second, competing one.
 */
export function actorId(): string {
  try {
    const existing = localStorage.getItem(ACTOR_KEY);
    if (existing) return existing;
    const created = randomId(8);
    localStorage.setItem(ACTOR_KEY, created);
    return created;
  } catch {
    return randomId(8);
  }
}

export type ThemeChoice = "system" | "light" | "dark";

export function loadTheme(): ThemeChoice {
  const stored = readJson<ThemeChoice>(THEME_KEY, "system");
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function saveTheme(choice: ThemeChoice): void {
  writeJson(THEME_KEY, choice);
  applyTheme(choice);
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

/** URL-safe identifier. Uses the platform's CSPRNG when it is available. */
export function randomId(length = 10): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => alphabet[v % alphabet.length]).join("");
}

const KEY_PREFIX = "bracketeer.key.";

/**
 * The secret that lets a device push changes for a tournament.
 *
 * It must be *random*, not derived from the tournament id: the id travels in
 * every link including the watch one, so anything computed from it could be
 * recomputed by exactly the people it is meant to exclude. That would be a
 * password printed on the door.
 *
 * So it is generated once, kept on the device that made the tournament, and
 * handed on only inside an organiser link.
 */
export function writeKeyFor(tournamentId: string): string {
  try {
    const existing = localStorage.getItem(`${KEY_PREFIX}${tournamentId}`);
    if (existing) return existing;
    const created = randomId(16);
    localStorage.setItem(`${KEY_PREFIX}${tournamentId}`, created);
    return created;
  } catch {
    // Private browsing: the key lives for this tab only, which still lets this
    // device push and still keeps a watch link from doing so.
    return randomId(16);
  }
}

/** Remember the key that arrived in an organiser link. */
export function rememberWriteKey(tournamentId: string, key: string): void {
  try {
    localStorage.setItem(`${KEY_PREFIX}${tournamentId}`, key);
  } catch {
    /* nothing worth interrupting the organiser for */
  }
}

/** The key this device already holds, if any, without creating one. */
export function storedWriteKey(tournamentId: string): string | null {
  try {
    return localStorage.getItem(`${KEY_PREFIX}${tournamentId}`);
  } catch {
    return null;
  }
}

/** A seed for the engine's deterministic draws. */
export function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}
