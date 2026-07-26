/**
 * The browser's compressor, handed to the engine's codec.
 *
 * The engine deliberately does not import a compression library, so this is
 * where the choice is made for the web build.
 */

import { decodeLog, encodeLog, type Compressor, type EventLog } from "@bracketeer/engine";
import { deflateSync, inflateSync } from "fflate";

export const compressor: Compressor = {
  deflate: (bytes) => deflateSync(bytes, { level: 9 }),
  inflate: (bytes) => inflateSync(bytes),
};

export function encode(log: EventLog): string {
  return encodeLog(log, compressor);
}

export function decode(encoded: string) {
  return decodeLog(encoded, compressor);
}
