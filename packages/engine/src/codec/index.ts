/**
 * Getting a tournament into a URL.
 *
 * With no server, the link *is* the storage. The event log is compacted into
 * short-keyed arrays, deflated, and base64url-encoded — in that order, because
 * the compactor removes the repetition that would otherwise dominate the
 * compressed size.
 *
 * Compression is supplied by the caller rather than imported here, so the
 * engine stays dependency-free and Node, the browser and tests can each provide
 * whatever they already have.
 */

import type { EventEnvelope, EventLog } from "../events/types.js";
import { sortLog } from "../events/types.js";

/** Bumped when the wire format changes in a way older readers cannot parse. */
export const CODEC_VERSION = 1;

export interface Compressor {
  deflate: (bytes: Uint8Array) => Uint8Array;
  inflate: (bytes: Uint8Array) => Uint8Array;
}

/**
 * Envelopes as fixed-order tuples rather than objects.
 *
 * Repeating `"lamport"` once per event costs more than every timestamp in a
 * tournament put together.
 */
type PackedEnvelope = [actor: string, seq: number, lamport: number, at: number, event: unknown];

interface Packed {
  v: number;
  /** Actors are interned, since a device id repeats on every event it produced. */
  a: string[];
  e: [number, number, number, number, unknown][];
}

function pack(log: EventLog): Packed {
  const actors: string[] = [];
  const indexOf = new Map<string, number>();

  const events = sortLog(log).map((envelope): [number, number, number, number, unknown] => {
    let index = indexOf.get(envelope.actor);
    if (index === undefined) {
      index = actors.length;
      actors.push(envelope.actor);
      indexOf.set(envelope.actor, index);
    }
    return [index, envelope.seq, envelope.lamport, envelope.at, envelope.event];
  });

  return { v: CODEC_VERSION, a: actors, e: events };
}

function unpack(packed: Packed): EventEnvelope[] {
  if (packed.v > CODEC_VERSION) {
    throw new Error(
      `This tournament was made with a newer version of Bracketeer (format ${packed.v}). Update the page and try again.`,
    );
  }

  return packed.e.map(([actorIndex, seq, lamport, at, event]): EventEnvelope => {
    const actor = packed.a[actorIndex] ?? "unknown";
    return {
      id: `${actor}:${seq}`,
      actor,
      seq,
      lamport,
      at,
      event: event as EventEnvelope["event"],
    };
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * base64url
 * ──────────────────────────────────────────────────────────────────────────── */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** Encoded by hand so the engine works identically in Node, the browser and a worker. */
export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];

    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b === undefined) break;
    out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c === undefined) break;
    out += ALPHABET[c & 63];
  }
  return out;
}

export function fromBase64Url(text: string): Uint8Array {
  const lookup = new Map<string, number>();
  for (let i = 0; i < ALPHABET.length; i += 1) lookup.set(ALPHABET[i] as string, i);

  const clean = text.replace(/[^A-Za-z0-9\-_]/g, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));

  let byte = 0;
  let bits = 0;
  let out = 0;

  for (const character of clean) {
    const value = lookup.get(character);
    if (value === undefined) continue;
    byte = (byte << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out] = (byte >> bits) & 0xff;
      out += 1;
    }
  }

  return bytes.subarray(0, out);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The round trip
 * ──────────────────────────────────────────────────────────────────────────── */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeLog(log: EventLog, compressor: Compressor): string {
  const json = JSON.stringify(pack(log));
  return toBase64Url(compressor.deflate(encoder.encode(json)));
}

export function decodeLog(encoded: string, compressor: Compressor): EventEnvelope[] {
  const json = decoder.decode(compressor.inflate(fromBase64Url(encoded)));
  return unpack(JSON.parse(json) as Packed);
}

/* ────────────────────────────────────────────────────────────────────────────
 * File export
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TournamentFile {
  format: "bracketeer";
  version: number;
  exportedAt: string;
  log: EventEnvelope[];
}

/** Readable JSON, for backups and for anyone who wants to read the log by hand. */
export function toJsonFile(log: EventLog, exportedAt: string): string {
  const file: TournamentFile = {
    format: "bracketeer",
    version: CODEC_VERSION,
    exportedAt,
    log: sortLog(log),
  };
  return JSON.stringify(file, null, 2);
}

export function fromJsonFile(text: string): EventEnvelope[] {
  const parsed = JSON.parse(text) as Partial<TournamentFile>;
  if (parsed.format !== "bracketeer" || !Array.isArray(parsed.log)) {
    throw new Error("That does not look like a Bracketeer export.");
  }
  if ((parsed.version ?? 0) > CODEC_VERSION) {
    throw new Error(
      `This file was made with a newer version of Bracketeer (format ${parsed.version}). Update the page and try again.`,
    );
  }
  return sortLog(parsed.log);
}

/* ────────────────────────────────────────────────────────────────────────────
 * Size budget
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Browsers vary in what length of URL they will accept, and some chat clients
 * truncate links well before that. Past this the app should push people towards
 * live sync or a file rather than let them share a link that silently breaks.
 */
export const URL_LENGTH_WARNING = 8_000;
export const URL_LENGTH_LIMIT = 30_000;

export type UrlSizeVerdict = "fine" | "long" | "too_long";

export function urlSizeVerdict(encoded: string): UrlSizeVerdict {
  if (encoded.length > URL_LENGTH_LIMIT) return "too_long";
  if (encoded.length > URL_LENGTH_WARNING) return "long";
  return "fine";
}

export type { PackedEnvelope };
