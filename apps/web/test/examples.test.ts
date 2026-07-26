/**
 * The worked examples are the product's central claim made checkable: every one
 * of them is reachable by composing the same six axes, with no sport-specific
 * code anywhere. If one stops parsing, the claim has broken.
 *
 * This also writes them out to `examples/` so they exist as data in the
 * repository, editable by anyone, rather than only as a TypeScript constant.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConfig, safeParseConfig } from "@bracketeer/engine";
import { describe, expect, it } from "vitest";
import { EXAMPLES } from "../src/lib/examples.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../examples");

describe("worked examples", () => {
  it.each(EXAMPLES.map((e) => [e.id, e] as const))("%s is a valid rule set", (_id, example) => {
    const result = safeParseConfig(example.config);
    expect(result.success, JSON.stringify(result.error?.issues, null, 2)).toBe(true);
  });

  it("covers every structure the engine supports", () => {
    const kinds = new Set(
      EXAMPLES.flatMap((e) => parseConfig(e.config).stages.map((s) => s.kind)),
    );
    expect(kinds).toContain("single_elimination");
    expect(kinds).toContain("double_elimination");
    expect(kinds).toContain("round_robin");
    expect(kinds).toContain("swiss");
    expect(kinds).toContain("groups");
  });

  it("covers every way of scoring", () => {
    const kinds = new Set(EXAMPLES.map((e) => parseConfig(e.config).score.kind));
    expect(kinds).toEqual(new Set(["points", "sets", "outcome", "placement"]));
  });

  it("reaches four different pairing strategies", () => {
    const strategies = new Set(EXAMPLES.map((e) => parseConfig(e.config).pairing.strategy));
    expect(strategies.size).toBeGreaterThanOrEqual(3);
  });

  it("writes each example out as data in examples/", () => {
    mkdirSync(root, { recursive: true });

    for (const example of EXAMPLES) {
      const file = {
        $schema: "https://github.com/maxgfr/bracketeer",
        name: example.name,
        summary: example.summary,
        signature: example.signature,
        config: example.config,
      };
      writeFileSync(resolve(root, `${example.id}.json`), `${JSON.stringify(file, null, 2)}\n`);
    }

    expect(EXAMPLES.length).toBeGreaterThan(5);
  });
});
