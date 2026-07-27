/**
 * Starting points, as data.
 *
 * Shapes named for the question they answer, and sports that are each one of
 * those shapes with the scoring and tiebreaks filled in. None of this is a mode
 * and none of it is known to the engine — every entry is a plain configuration
 * object the engine would accept from anybody.
 *
 *   import { EXAMPLES, SPORTS, findExample } from "bracketeer-cli/presets";
 *
 *   const knockout = findExample("knockout");        // → { id, name, summary, config }
 *
 * Kept in its own entry point so importing the engine does not drag in a table
 * of sports nobody asked for.
 */

export * from "@bracketeer/presets";
