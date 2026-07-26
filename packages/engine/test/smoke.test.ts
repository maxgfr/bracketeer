import { describe, expect, it } from "vitest";
import { VERSION } from "../src/index.js";

describe("engine", () => {
  it("exposes a version", () => {
    expect(VERSION).toBe("0.1.0");
  });
});
