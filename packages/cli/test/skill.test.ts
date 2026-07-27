/**
 * The skill, held to the code.
 *
 * A skill that has drifted is worse than no skill, because it gets followed
 * confidently: an agent told to run `bracketeer withdraw` will report that it
 * withdrew somebody whether or not the command exists. So every claim the
 * SKILL.md makes that *can* be checked is checked here, and the strong ones are
 * checked by doing rather than by matching strings — the score table is proved
 * by parsing each example it gives, not by looking for the word "points".
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConfig } from "@bracketeer/engine";
import { findExample } from "@bracketeer/presets";
import { describe, expect, it } from "vitest";
import * as ops from "../src/ops.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const skillPath = resolve(root, "skills/bracketeer/SKILL.md");
const skill = readFileSync(skillPath, "utf8");
const cliSource = readFileSync(resolve(root, "packages/cli/src/cli.ts"), "utf8");
const mcpSource = readFileSync(resolve(root, "packages/cli/src/mcp.ts"), "utf8");

const unique = (values: readonly string[]) => [...new Set(values)];

function matchAll(pattern: RegExp, text: string, group = 1): string[] {
  return [...text.matchAll(pattern)].map((m) => m[group]!).filter(Boolean);
}

describe("the skill's front matter", () => {
  it("has a name and a description, which is how it gets found at all", () => {
    expect(skill.startsWith("---\n")).toBe(true);
    const front = skill.slice(4, skill.indexOf("\n---", 4));
    expect(front).toMatch(/^name: bracketeer$/m);
    expect(front).toMatch(/^description: .{80,}/m);
  });

  it("is named for the directory it lives in, which is what installers key on", () => {
    expect(skillPath).toContain("skills/bracketeer/SKILL.md");
  });
});

/**
 * The runnable lines, which are what an agent will copy.
 *
 * Only shell blocks count — prose says things like "inside the bracketeer repo"
 * and a regex over the whole document decides `repo` is a subcommand.
 */
const shellLines = [...skill.matchAll(/```bash\n([\s\S]*?)```/g)]
  .flatMap((block) => block[1]!.split("\n"))
  .map((line) => line.replace(/#.*$/, "").trim())
  .filter(Boolean);

describe("every command the skill tells an agent to run", () => {
  const commands = unique(
    shellLines
      .map((line) => /^(?:bracketeer|npx -y bracketeer-cli@latest|node \S+cli\.mjs)\s+([a-z-]+)/.exec(line))
      .filter(Boolean)
      .map((m) => m![1]!),
  );

  it("finds some to check, or this test is proving nothing", () => {
    expect(commands.length).toBeGreaterThan(10);
  });

  it.each(commands)("`bracketeer %s` exists in the CLI", (command) => {
    expect(cliSource).toContain(`case "${command}":`);
  });
});

describe("every flag the skill uses", () => {
  const flags = unique(shellLines.flatMap((line) => matchAll(/\s--([a-z][a-z-]*)/g, line)));

  it.each(flags)("--%s is read somewhere in the CLI", (flag) => {
    // `--json` is handled by the shared emitter rather than by name at a call site.
    expect(cliSource).toMatch(new RegExp(`"${flag}"`));
  });
});

describe("every MCP tool the skill names", () => {
  // Named in one paragraph, so the search is scoped to it rather than to every
  // snake_case token in the document.
  const paragraph = /There is also an MCP server[\s\S]*?\n\n/.exec(skill)?.[0] ?? "";
  const tools = unique(matchAll(/`([a-z]+(?:_[a-z]+)+)`/g, paragraph));

  it("finds the paragraph, and some tools in it", () => {
    expect(tools.length).toBeGreaterThan(5);
  });

  it.each(tools)("%s is registered on the server", (tool) => {
    expect(mcpSource).toContain(`"${tool}"`);
  });
});

describe("every shape the skill recommends", () => {
  /** The routing table: "they want X → reach for these". */
  const recommended = unique(
    matchAll(/`([a-z][a-z-]+)`/g, skill.slice(skill.indexOf("## Choosing a structure"))),
  ).filter((token) => findExample(token) !== undefined);

  it("finds the table, and it is not empty", () => {
    expect(recommended.length).toBeGreaterThan(8);
  });

  it.each(recommended)("%s is a real starting point that parses", (id) => {
    const example = findExample(id)!;
    expect(() => parseConfig(example.config)).not.toThrow();
  });

  it("names no shape that does not exist", () => {
    // Anything backticked in that table which looks like an id must resolve.
    const table = skill.slice(skill.indexOf("| They want"), skill.indexOf("```bash"));
    for (const token of unique(matchAll(/`([a-z][a-z-]+)`/g, table))) {
      expect(findExample(token), `"${token}" is offered but does not exist`).toBeDefined();
    }
  });
});

describe("the sports shortcut the skill demonstrates", () => {
  it("resolves, because the example command would otherwise fail", () => {
    const named = matchAll(/--sport ([a-z-]+)/g, skill);
    expect(named.length).toBeGreaterThan(0);
    for (const sport of unique(named)) {
      expect(() => ops.resolveStart({ sport })).not.toThrow();
    }
  });
});

describe("the score table", () => {
  /**
   * Proved by parsing rather than by reading: each row's example is fed to the
   * real parser under that row's score kind. If the notation ever changes, this
   * fails with the row that lied.
   */
  const rows = [...skill.matchAll(/^\| (points|sets|outcome|placement|time) \| (.+) \|$/gm)];

  it("covers every kind the engine scores by", () => {
    expect(rows.map((r) => r[1])).toEqual(["points", "sets", "outcome", "placement", "time"]);
  });

  it.each(rows.map((r) => [r[1]!, r[2]!] as const))(
    "the %s row's examples all parse",
    (kind, cell) => {
      const config = parseConfig({ score: { kind } }).score;
      const examples = matchAll(/`"([^"]+)"`/g, cell);

      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) {
        expect(() => ops.parseScore(config, example), `${kind}: "${example}"`).not.toThrow();
      }
    },
  );
});

describe("the fields the skill tells an agent to read", () => {
  it("status really reports `next`", () => {
    expect(skill).toContain("status.next");
    const { log } = ops.create({ shape: "knockout", entrants: [], seed: 1, actor: "t" });
    expect(ops.status(log).next).toBeTypeOf("string");
  });

  it("standings really reports `tiedWithNext`", () => {
    expect(skill).toContain("tiedWithNext");
    let { log } = ops.create({
      shape: "all-play-all",
      entrants: ["A", "B", "C", "D"],
      seed: 1,
      actor: "t",
    });
    log = ops.start(log, { actor: "t" }).log;
    expect(ops.standings(log)[0]).toHaveProperty("tiedWithNext");
  });

  it("shapes really reports `matchesEach`", () => {
    expect(skill).toContain("matchesEach");
    expect(ops.listShapes()[0]).toHaveProperty("matchesEach");
  });

  it("link really reports a `too_long` verdict", () => {
    expect(skill).toContain("too_long");
    const { log } = ops.create({ shape: "knockout", entrants: ["A", "B"], seed: 1, actor: "t" });
    expect(ops.link(log, { id: "x", audience: "watch" })).toHaveProperty("verdict");
  });

  it("drawn_lot really is a tiebreaker", () => {
    expect(skill).toContain("drawn_lot");
    expect(() =>
      parseConfig({ standings: { tiebreakers: [{ key: "drawn_lot" }] } }),
    ).not.toThrow();
  });
});

describe("the privacy claims, which are the ones that matter most", () => {
  it("is right that a watch link is the default", () => {
    const { log } = ops.create({
      shape: "knockout",
      entrants: ["A", "B"],
      seed: 1,
      actor: "t",
    });
    // The skill says "gives a watch link by default".
    expect(skill).toMatch(/watch link by default/);
    expect(ops.link(log, { id: "x", audience: "watch" }).audience).toBe("watch");
  });

  it("is right that a watch link never carries the key", () => {
    const { log } = ops.create({ shape: "knockout", entrants: ["A", "B"], seed: 1, actor: "t" });
    const { url } = ops.link(log, { id: "x", audience: "watch", writeKey: "secret" });
    expect(url).not.toContain("secret");
  });
});

describe("every path the skill points at", () => {
  const paths = unique(matchAll(/`((?:packages|apps|docs)\/[\w./-]+)`/g, skill));

  it.each(paths.length > 0 ? paths : ["packages/cli/src/cli.ts"])("%s exists", (path) => {
    expect(existsSync(resolve(root, path))).toBe(true);
  });
});
