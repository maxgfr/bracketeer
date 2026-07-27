/**
 * Node's compressor, handed to the engine's codec.
 *
 * The engine takes compression as an argument rather than importing a library,
 * so each host picks its own. The browser build uses `fflate`; here it is
 * `node:zlib`.
 *
 * **These have to agree, and the obvious pairing is the wrong one.**
 * `fflate.deflateSync` emits a *raw* DEFLATE stream with no header and no
 * checksum — its zlib-wrapped function is `zlibSync`. So the counterpart here is
 * `deflateRawSync`, not `deflateSync`: pairing the two similarly-named ones
 * produces links that encode fine, decode fine locally, and fail the moment they
 * cross to the other host.
 *
 * That is the entire point of this package, so it is not left to inspection:
 * `test/link.test.ts` decodes each side's output with the other.
 */

import { deflateRawSync, inflateRawSync } from "node:zlib";
import { decodeLog, encodeLog, type Compressor, type EventLog } from "@bracketeer/engine";

export const compressor: Compressor = {
  deflate: (bytes) => new Uint8Array(deflateRawSync(bytes, { level: 9 })),
  inflate: (bytes) => new Uint8Array(inflateRawSync(bytes)),
};

export function encode(log: EventLog): string {
  return encodeLog(log, compressor);
}

export function decode(encoded: string) {
  return decodeLog(encoded, compressor);
}

/** Where the app is served. Overridable for a fork or a local build. */
export function siteOrigin(): string {
  return process.env.BRACKETEER_SITE ?? "https://maxgfr.github.io/bracketeer/";
}
