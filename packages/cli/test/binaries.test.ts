/**
 * The two binaries, actually run.
 *
 * `consumer.test.ts` covers the library entry points and `skill.test.ts` checks
 * that the source contains the commands the skill names — but until this file,
 * nothing executed `dist/cli.mjs` or `dist/mcp.mjs`. Every check of them was me
 * running them by hand, which proves the build of that afternoon and nothing
 * afterwards.
 *
 * It matters most for the MCP server: its SDK is bundled in rather than declared
 * as a dependency, so `bracketeer-cli` has exactly one. Bundling a framework is
 * the kind of thing that works until the framework adds a dynamic import, and
 * the symptom is a binary that dies on startup for everybody who installed it.
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = join(pkgRoot, "dist", "cli.mjs");
const MCP = join(pkgRoot, "dist", "mcp.mjs");

let home: string;
beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), "bracketeer-bin-"));
});
afterAll(() => rmSync(home, { recursive: true, force: true }));

/** Run the command the way a shell would, and give back stdout. */
function run(...args: string[]): string {
  return execFileSync(process.execPath, [CLI, ...args], {
    encoding: "utf8",
    env: { ...process.env, BRACKETEER_HOME: home },
  });
}

describe("the bracketeer command", () => {
  it("starts at all, and reports the published version", () => {
    const { version } = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
    expect(run("version").trim()).toBe(version);
  });

  it("describes itself without needing a tournament", () => {
    const help = run("help");
    expect(help).toContain("run a tournament from the terminal");
    // The commands the skill teaches have to be the commands help offers.
    for (const command of ["shapes", "status", "start", "report", "standings", "link"]) {
      expect(help).toContain(command);
    }
  });

  it("plays a tournament end to end through the binary", () => {
    const created = JSON.parse(
      run("new", "--shape", "knockout", "--entrants", "Marie,Luc,Ana,Paul", "--seed", "4", "--as", "bin", "--json"),
    ) as { id: string; entrants: number };
    expect(created.entrants).toBe(4);

    run("start", "bin");

    for (let guard = 0; guard < 10; guard += 1) {
      const ready = JSON.parse(run("matches", "bin", "--ready", "--json")) as { id: string }[];
      if (ready.length === 0) break;
      for (const match of ready) run("report", "bin", match.id, "--score", "13-7");
    }

    const status = JSON.parse(run("status", "bin", "--json")) as { next: string; played: number };
    expect(status.played).toBe(3);
    expect(status.next).toBe("Finished.");

    const table = JSON.parse(run("standings", "bin", "--json")) as { rank: number }[];
    expect(table[0]?.rank).toBe(1);
  });

  it("produces a watch link with no organiser key", () => {
    const link = JSON.parse(run("link", "bin", "--json")) as { url: string; audience: string };
    expect(link.audience).toBe("watch");
    expect(link.url).toContain("#/t/bin?d=");
    expect(link.url).not.toContain("&k=");
  });

  it("fails with a message rather than a stack trace", () => {
    expect(() => run("nonsense")).toThrow();
    try {
      run("nonsense");
    } catch (cause) {
      const failure = cause as { stderr: string; status: number };
      expect(failure.status).toBe(1);
      expect(failure.stderr).toContain("bracketeer help");
      expect(failure.stderr).not.toContain("at Object.");
    }
  });
});

describe("the bracketeer-mcp server", () => {
  it("starts with its SDK bundled in, and answers a tools/list", async () => {
    const child = spawn(process.execPath, [MCP], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, BRACKETEER_HOME: home },
    });

    let out = "";
    let err = "";
    child.stdout.on("data", (c: Buffer) => (out += c.toString()));
    child.stderr.on("data", (c: Buffer) => (err += c.toString()));

    const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
    const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const reply = (id: number) =>
      out
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line) as { id?: number; result?: { tools?: { name: string }[] } };
          } catch {
            return null;
          }
        })
        .find((message) => message?.id === id);

    try {
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        },
      });
      await settle(1500);
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      await settle(1500);

      const listed = reply(2);
      expect(listed, `no reply. stderr: ${err.slice(0, 400)}`).toBeDefined();

      const names = listed!.result!.tools!.map((t) => t.name);
      // The tools the skill tells an agent to reach for.
      for (const tool of [
        "create_tournament",
        "add_entrants",
        "start_stage",
        "report_result",
        "standings",
        "share_link",
      ]) {
        expect(names).toContain(tool);
      }
    } finally {
      child.kill();
    }
  }, 30_000);
});

describe("what installing this package pulls in", () => {
  it("declares one dependency, so the library is not a server framework in disguise", () => {
    const { dependencies } = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    // zod has to stay external: a schema built by a bundled copy fails
    // `instanceof` against the consumer's own zod.
    expect(Object.keys(dependencies)).toEqual(["zod"]);
  });
});
