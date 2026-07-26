/**
 * @bracketeer/engine
 *
 * A sport-agnostic tournament engine.
 *
 * The engine knows nothing about pétanque, chess or football. It knows about
 * six orthogonal axes, and a "sport" is simply a point in that space:
 *
 *   1. entrant + match shape   who plays, and how many sides meet in one match
 *   2. score kind              how a result is expressed
 *   3. structure               the shape of the event, as a pipeline of stages
 *   4. consolation             what happens to the people who lose
 *   5. pairing                 who plays whom, under weighted constraints
 *   6. standings               how points are awarded and ties are broken
 *
 * Everything is a pure function of an append-only event log, so a tournament is
 * reproducible, mergeable across peers, and undoable for free.
 */

export const VERSION = "0.1.0";

export * from "./domain/config.js";
export * from "./domain/entities.js";
export * from "./events/types.js";
export * from "./events/reducer.js";
export * from "./scoring/normalize.js";
export * from "./util/rng.js";
