import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  localStorage.clear();

  // happy-dom has no object URLs, no printer and no clipboard. Stubbing them
  // rather than skipping the tests, because downloading a file and copying a
  // link are two of the three ways a tournament leaves this app.
  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:http://localhost/stub"),
    revokeObjectURL: vi.fn(),
  });
  vi.spyOn(window, "print").mockImplementation(() => undefined);

  // A download is an anchor click. happy-dom treats that as navigation and
  // corrupts window.location for every test that follows, so the click is
  // stubbed — createObjectURL, which runs first, is the thing worth asserting.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

  // navigator.clipboard is a getter-only property, so it has to be redefined.
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(async () => undefined) },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
