/**
 * Where a tournament lives outside the browser.
 *
 * The browser keeps the log in `localStorage`; here it is a file. Same log, same
 * format as the app's export, so a tournament started in a conversation can be
 * finished on a phone and the other way round — that interchange is the reason
 * this exists at all, and the reason it writes `toJsonFile` rather than
 * something more convenient.
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fromJsonFile, toJsonFile, type EventLog } from "@bracketeer/engine";

/** Overridable so a caller can keep tournaments beside a project. */
export function storeDir(): string {
  return process.env.BRACKETEER_HOME ?? join(homedir(), ".bracketeer");
}

export function pathFor(idOrPath: string): string {
  // Anything that looks like a path is one; a bare id lives in the store.
  if (idOrPath.includes("/") || idOrPath.endsWith(".json")) return resolve(idOrPath);
  return join(storeDir(), `${idOrPath}.json`);
}

export function load(idOrPath: string): EventLog {
  const file = pathFor(idOrPath);
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `No tournament at ${file}. Run \`bracketeer new\` first, or pass --file with a path.`,
    );
  }
  return fromJsonFile(text);
}

export function save(idOrPath: string, log: EventLog): string {
  const file = pathFor(idOrPath);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, toJsonFile(log, new Date().toISOString()));
  return file;
}

export interface StoredSummary {
  id: string;
  file: string;
  updatedAt: string;
}

export function list(): StoredSummary[] {
  let names: string[];
  try {
    names = readdirSync(storeDir());
  } catch {
    return [];
  }

  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const file = join(storeDir(), name);
      return {
        id: name.replace(/\.json$/, ""),
        file,
        updatedAt: statSync(file).mtime.toISOString(),
      };
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

/**
 * A short, unambiguous id.
 *
 * The alphabet drops `l` and `1` and `0`, because these get read aloud across a
 * sports hall and written on a whiteboard.
 */
export function randomId(length = 10): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, (v) => alphabet[v % alphabet.length]).join("");
}

export function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}
