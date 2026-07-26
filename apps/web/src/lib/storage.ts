/**
 * Local persistence.
 *
 * There is no server, so the browser is the only durable copy a tournament has
 * until somebody exports it or shares the link. Every write is defensive:
 * private browsing and a full quota both throw, and losing a score entry to an
 * exception thrown by the *storage* layer would be the worst possible failure.
 */

import type { EventLog } from "@bracketeer/engine";

const INDEX_KEY = "bracketeer.index";
const LOG_PREFIX = "bracketeer.log.";
const ACTOR_KEY = "bracketeer.actor";
const THEME_KEY = "bracketeer.theme";

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

export function listTournaments(): StoredTournament[] {
  return readJson<StoredTournament[]>(INDEX_KEY, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadLog(id: string): EventLog | null {
  return readJson<EventLog | null>(`${LOG_PREFIX}${id}`, null);
}

export function saveLog(id: string, log: EventLog, summary: Omit<StoredTournament, "id" | "updatedAt">): boolean {
  const ok = writeJson(`${LOG_PREFIX}${id}`, log);
  if (!ok) return false;

  const index = readJson<StoredTournament[]>(INDEX_KEY, []).filter((t) => t.id !== id);
  index.push({ id, updatedAt: Date.now(), ...summary });
  return writeJson(INDEX_KEY, index);
}

export function forgetTournament(id: string): void {
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

/** A seed for the engine's deterministic draws. */
export function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}
