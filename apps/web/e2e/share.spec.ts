/**
 * What a link actually shows the person you sent it to.
 *
 * This is the one claim that has to be checked in a browser. "Private means
 * absent, not hidden" is a statement about bytes that leave the device, and the
 * only honest way to test it is to open the link the way a stranger would and
 * look at the page they get.
 *
 * The links here are built the same way `src/lib/share.ts` builds them — the
 * engine redacts, fflate compresses — rather than by driving the interface to
 * produce one. Driving the UI would test the button; this tests the guarantee.
 */

import {
  addEntrant,
  appendEvent,
  createTournament,
  encodeLog,
  logFor,
  parseConfig,
  startStage,
  replay,
  type Compressor,
  type EventLog,
} from "@bracketeer/engine";
import { expect, test } from "@playwright/test";
import { deflateSync, inflateSync } from "fflate";

/** Exactly what the browser build hands the engine, from `src/lib/codec.ts`. */
const compressor: Compressor = {
  deflate: (bytes) => deflateSync(bytes, { level: 9 }),
  inflate: (bytes) => inflateSync(bytes),
};

const PHONE = "0612345678";
const CLUB = "Northbridge";
const KEY = "organiserkey0123";
const ID = "e2e";

const config = {
  score: { kind: "points" as const, target: 13 },
  entrantFields: [
    { key: "club", label: "Club", private: false },
    { key: "phone", label: "Phone" },
  ],
};

/** A started tournament where one entrant has a published field and a private one. */
function tournament(): EventLog {
  const at = 1_700_000_000_000;
  let log: EventLog = appendEvent(
    [],
    "organiser",
    createTournament({
      name: "Club night",
      config,
      seed: 5,
      createdAt: "2023-11-14T22:13:20.000Z",
    }),
    at,
  );

  const roster = [
    { id: "marie", name: "Marie Dubois", meta: { club: CLUB, phone: PHONE } },
    { id: "luc", name: "Luc Martin", meta: {} },
    { id: "ana", name: "Ana Costa", meta: {} },
    { id: "paul", name: "Paul Rossi", meta: {} },
  ];

  roster.forEach((entrant, i) => {
    log = appendEvent(log, "organiser", addEntrant({ ...entrant, seed: i + 1 }), at + i + 1);
  });

  for (const event of startStage(replay(log), "main")) {
    log = appendEvent(log, "organiser", event, at + 20 + log.length);
  }

  return log;
}

const parsed = parseConfig(config);
const log = tournament();

/** `#/t/:id?d=…`, the shape `src/lib/share.ts` produces. */
function link(audience: "watch" | "run", path = ""): string {
  const encoded = encodeLog(logFor(log, parsed, audience), compressor);
  const key = audience === "run" ? `&k=${KEY}` : "";
  return `#/t/${ID}${path}?d=${encoded}${key}`;
}

test.describe("a watch link, opened by a spectator", () => {
  test("shows the tournament", async ({ page }) => {
    await page.goto(link("watch"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Club night");
  });

  test("never contains the private field, anywhere in the page", async ({ page }) => {
    // Not "is not displayed" — not present. The value was never sent, so no
    // amount of looking at the document can recover it.
    for (const path of ["", "/entrants", "/standings", "/draw"]) {
      await page.goto(link("watch", path));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.content()).not.toContain(PHONE);
      expect(await page.content()).not.toContain("Phone");
    }
  });

  test("keeps the field the organiser did publish", async ({ page }) => {
    await page.goto(link("watch", "/entrants"));
    // Names and custom fields are editable inputs on this tab, so the value is
    // in `value` rather than in a text node — hence a role and a value, not text.
    await expect(page.getByRole("textbox", { name: `Club for Marie Dubois` })).toHaveValue(CLUB);
    await expect(page.getByRole("textbox", { name: "Name of entrant 1" })).toHaveValue(
      "Marie Dubois",
    );
  });

  test("offers no control that would hand anything on", async ({ page }) => {
    await page.goto(link("watch"));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /copy link/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /go live/i })).toHaveCount(0);
  });

  test("carries no organiser key in the address", async ({ page }) => {
    await page.goto(link("watch"));
    expect(page.url()).not.toContain(KEY);
  });
});

test.describe("an organiser link, opened by somebody helping run it", () => {
  test("offers the controls a watch link does not", async ({ page }) => {
    await page.goto(link("run"));
    await expect(page.getByRole("button", { name: /copy link/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /go live/i })).toBeVisible();
  });

  test("carries the private field, because that is who it is for", async ({ page }) => {
    await page.goto(link("run", "/entrants"));
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.content()).toContain(PHONE);
  });
});

test.describe("the embed", () => {
  test("renders read-only and redacted", async ({ page }) => {
    const encoded = encodeLog(logFor(log, parsed, "watch"), compressor);
    await page.goto(`#/embed/${ID}?d=${encoded}`);

    await expect(page.getByText("Club night")).toBeVisible();
    expect(await page.content()).not.toContain(PHONE);
    // No navigation and no controls: a club website wants the results.
    await expect(page.getByRole("button", { name: /start|go live|copy/i })).toHaveCount(0);
  });
});

test("the app loads at all under its real base path, from the built bundle", async ({ page }) => {
  // Nothing else in the suite exercises `/bracketeer/` or `dist/` — the unit
  // tests import source and serve from the root.
  const response = await page.goto("./");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
