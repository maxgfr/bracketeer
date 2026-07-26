/**
 * @bracketeer/engine
 *
 * A sport-agnostic tournament engine.
 *
 * The engine knows nothing about pétanque, chess or football. It knows about
 * six orthogonal axes, and a "sport" is simply a point in that space:
 *
 *   1. entrant kind      who plays        individual | fixed_team | drawn_team | free_for_all
 *   2. score kind        how you win      points | sets | outcome | placement | time
 *   3. structure         the shape        elimination | swiss | round_robin | groups | ladder
 *   4. consolation       second chances   none | third_place | full_consolation | repechage
 *   5. pairing           who plays whom   seeded | random | closest_record | closest_rating | ...
 *   6. tiebreakers       who ranks above  an ordered, reorderable list
 *
 * Everything is a pure function of an append-only event log, so a tournament is
 * reproducible, mergeable across peers, and undoable for free.
 */

export const VERSION = "0.1.0";
