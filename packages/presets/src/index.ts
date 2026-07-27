/**
 * @bracketeer/presets
 *
 * Starting points. Not modes, and not a feature of the engine — every one of
 * these is a plain configuration object the engine would accept from anybody.
 *
 * They live outside the engine on purpose. The engine must not contain the word
 * "petanque", and `packages/engine/test/architecture.test.ts` fails the build if
 * it ever does; the moment a sport can be named in there, somebody writes
 * `if (sport === …)` and the whole model stops composing. So the sport-shaped
 * knowledge sits here, one layer out, as data.
 *
 * They live outside the *app* because the app is no longer the only front end.
 * The CLI offers the same vocabulary, and a second copy of it would drift.
 */

export * from "./examples.js";
export * from "./sports.js";
