/**
 * The library.
 *
 * `bracketeer-cli` is a command, and this is the same engine underneath it,
 * importable. The name reads oddly for an import — it is one package because
 * one package is one npm publication to configure and keep releasing in step,
 * and a split later can re-export this without breaking anybody.
 *
 * What you get is a sport-agnostic tournament engine: formats, pairing,
 * standings, ratings, scheduling, redaction. It knows nothing about any sport.
 * A sport is a point in a configuration space made of six independent axes —
 * see the README, or `parseConfig` for the contract.
 *
 * The shape of using it:
 *
 *   import { createTournament, addEntrant, appendEvent, replay, startStage } from "bracketeer-cli";
 *
 *   let log = appendEvent([], "me", createTournament({ … }), Date.now());
 *   log = appendEvent(log, "me", addEntrant({ id: "a", name: "Ana" }), Date.now());
 *   const state = replay(log);
 *
 * Commands return events, you append them, and state is a fold over the log.
 * Nothing mutates, so undo is dropping an event and two devices replaying the
 * same log reach identical state.
 */

export * from "@bracketeer/engine";

/**
 * The published version of this package.
 *
 * Substituted at build time from package.json. The engine used to export a
 * `VERSION` of its own, typed into the source, which would have been wrong from
 * the first release onwards.
 */
export { VERSION } from "./version.js";
