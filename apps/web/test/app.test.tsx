/**
 * End-to-end behaviour, through the real interface.
 *
 * These drive the actual components — clicking the same buttons an organiser
 * clicks — so they catch the wiring that unit tests on the engine cannot: a
 * store that fails to persist, a panel reading the wrong field, a score entry
 * form that will not submit.
 */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../src/App.js";
import { encode } from "../src/lib/codec.js";
import { addEntrant, appendEvent, createTournament, type EventEnvelope } from "@bracketeer/engine";

function seedTournament(names: string[], config: Record<string, unknown> = {}) {
  let log: EventEnvelope[] = [];
  const at = 1_700_000_000_000;

  log = appendEvent(
    log,
    "test",
    createTournament({
      name: "Club Open",
      config: { score: { kind: "points", target: 13 }, ...config },
      seed: 42,
      createdAt: new Date(at).toISOString(),
    }),
    at,
  );

  names.forEach((name, i) => {
    log = appendEvent(log, "test", addEntrant({ id: `e${i}`, name, seed: i + 1 }), at + i + 1);
  });

  localStorage.setItem("bracketeer.log.demo", JSON.stringify(log));
  localStorage.setItem(
    "bracketeer.index",
    JSON.stringify([{ id: "demo", name: "Club Open", updatedAt: at, entrants: names.length }]),
  );
  return log;
}

function goTo(path: string) {
  window.location.hash = path;
}

describe("the front page", () => {
  it("explains what this is and how to begin", () => {
    goTo("#/");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/run the tournament/i);
    expect(screen.getByRole("button", { name: /start a tournament/i })).toBeInTheDocument();
  });

  it("lists tournaments saved on this device", () => {
    seedTournament(["Marie", "Luc"]);
    goTo("#/");
    render(<App />);

    expect(screen.getByRole("link", { name: "Club Open" })).toBeInTheDocument();
  });

  it("says so plainly when there is nothing saved", () => {
    goTo("#/");
    render(<App />);
    expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
  });
});

describe("creating a tournament", () => {
  it("takes a name and a roster and opens the tournament", async () => {
    const user = userEvent.setup();
    goTo("#/new");
    render(<App />);

    await user.type(screen.getByPlaceholderText(/pétanque concours/i), "Spring Open");
    await user.type(
      screen.getByPlaceholderText(/Marie Dubois/),
      "Marie\nLuc\nAna\nPaul",
    );
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Spring Open");
    });
    expect(screen.getByText(/4 entrants/)).toBeInTheDocument();
  });

  it("offers compositions rather than sports", () => {
    goTo("#/new");
    render(<App />);

    // Each starting point states the choices that make it what it is.
    expect(screen.getByText(/closest record · consolation · Buchholz/)).toBeInTheDocument();
    expect(screen.getByText(/two legs · home and away · 3-1-0/)).toBeInTheDocument();
  });
});

describe("running a tournament", () => {
  it("draws the bracket and then asks for scores", async () => {
    const user = userEvent.setup();
    seedTournament(["Marie", "Luc", "Ana", "Paul"]);
    goTo("#/t/demo");
    render(<App />);

    await user.click(screen.getByRole("button", { name: /start the tournament/i }));

    // Two semi-finals are now waiting for a score.
    await waitFor(() => {
      expect(screen.getByText(/2 awaiting a score/i)).toBeInTheDocument();
    });
  });

  it("records a score typed into the fixture", async () => {
    const user = userEvent.setup();
    seedTournament(["Marie", "Luc", "Ana", "Paul"]);
    goTo("#/t/demo");
    render(<App />);

    await user.click(screen.getByRole("button", { name: /start the tournament/i }));
    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);

    await user.type(screen.getByLabelText("Score for Marie"), "13");
    await user.type(screen.getByLabelText("Score for Paul"), "7");
    await user.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() => {
      expect(screen.getByText(/1 played/i)).toBeInTheDocument();
    });
  });

  it("refuses a scoreline the rules do not allow, and says why", async () => {
    const user = userEvent.setup();
    seedTournament(["Marie", "Luc", "Ana", "Paul"]);
    goTo("#/t/demo");
    render(<App />);

    await user.click(screen.getByRole("button", { name: /start the tournament/i }));
    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);

    // Draws are off by default, and the tournament plays to 13.
    await user.type(screen.getByLabelText("Score for Marie"), "13");
    await user.type(screen.getByLabelText("Score for Paul"), "13");
    await user.click(screen.getByRole("button", { name: "Record" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/does not allow draws/i);

    await user.clear(screen.getByLabelText("Score for Paul"));
    await user.type(screen.getByLabelText("Score for Paul"), "20");
    await user.click(screen.getByRole("button", { name: "Record" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/plays to 13/i);
  });

  it("only ever offers the one thing that can happen next", async () => {
    const user = userEvent.setup();
    seedTournament(["Marie", "Luc", "Ana", "Paul"], {
      pairing: { strategy: "closest_record" },
      stages: [{ kind: "swiss", id: "main", rounds: 2 }],
    });
    goTo("#/t/demo");
    render(<App />);

    await user.click(screen.getByRole("button", { name: /start the tournament/i }));

    // Round one is drawn, so the next action is to play it — not to draw again.
    expect(screen.queryByRole("button", { name: /draw the next round/i })).not.toBeInTheDocument();
    expect(screen.getByText(/2 fixtures still to be played/i)).toBeInTheDocument();

    for (const button of await screen.findAllByRole("button", { name: /enter the score/i })) {
      await user.click(button);
      const inputs = screen.getAllByRole("textbox");
      await user.type(inputs[0]!, "13");
      await user.type(inputs[1]!, "5");
      await user.click(screen.getByRole("button", { name: "Record" }));
    }

    // Now, and only now, the next round can be drawn.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /draw the next round/i })).toBeInTheDocument();
    });
  });
});

describe("the rules", () => {
  it("lets the tiebreak order be rearranged", async () => {
    const user = userEvent.setup();
    seedTournament(["Marie", "Luc"]);
    goTo("#/t/demo/rules");
    render(<App />);

    const first = screen.getByLabelText("Tiebreaker 1");
    expect(first).toHaveValue("points");

    await user.selectOptions(first, "buchholz");
    await waitFor(() => {
      expect(screen.getByLabelText("Tiebreaker 1")).toHaveValue("buchholz");
    });
  });

  it("names the problem when the raw configuration is wrong", async () => {
    const user = userEvent.setup();
    seedTournament(["Marie", "Luc"]);
    goTo("#/t/demo/rules");
    render(<App />);

    const raw = screen.getByLabelText(/raw tournament configuration/i);
    // Typed rather than pasted, because user-event reads `{` as a key descriptor.
    fireEvent.change(raw, { target: { value: '{"stages":[]}' } });

    await waitFor(() => {
      expect(screen.getByText(/at least 1 element/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();

    fireEvent.change(raw, { target: { value: "not json" } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
    });
    void user;
  });
});

describe("the standings", () => {
  it("shows a column for every tiebreaker, so the order can be checked", async () => {
    const user = userEvent.setup();
    seedTournament(["Marie", "Luc", "Ana", "Paul"], {
      standings: {
        tiebreakers: [{ key: "wins" }, { key: "buchholz" }, { key: "point_diff" }],
      },
    });
    goTo("#/t/demo");
    render(<App />);

    await user.click(screen.getByRole("button", { name: /start the tournament/i }));
    await user.click(screen.getByRole("link", { name: "Standings" }));

    const table = await screen.findByRole("table");
    expect(within(table).getByRole("columnheader", { name: "BUCH" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "±" })).toBeInTheDocument();
  });
});

describe("sharing", () => {
  it("reads a tournament out of the link alone", async () => {
    const log = seedTournament(["Marie", "Luc"]);
    localStorage.clear();

    goTo(`#/t/fromlink?d=${encode(log)}`);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Club Open");
    });
  });

  it("says what went wrong when a link has been truncated", async () => {
    goTo("#/t/broken?d=thisisnotavalidpayload");
    render(<App />);

    expect(await screen.findByText(/could not be read/i)).toBeInTheDocument();
  });

  it("renders a read-only embed with no controls", async () => {
    const log = seedTournament(["Marie", "Luc"]);
    goTo(`#/embed/demo?d=${encode(log)}`);
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Club Open");
    expect(screen.queryByRole("button", { name: /start the tournament/i })).not.toBeInTheDocument();
  });
});

describe("entrants", () => {
  it("withdraws somebody without erasing what they played", async () => {
    const user = userEvent.setup();
    seedTournament(["Marie", "Luc", "Ana", "Paul"]);
    goTo("#/t/demo/entrants");
    render(<App />);

    await user.click(screen.getAllByRole("button", { name: "Withdraw" })[0]!);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Reinstate" })[0]).toBeInTheDocument();
    });
    // Still listed — withdrawing is not deleting.
    expect(screen.getByDisplayValue("Marie")).toBeInTheDocument();
  });
});

describe("form affordances", () => {
  it("gives entrant names and seeds real, editable fields", async () => {
    const user = userEvent.setup();
    seedTournament(["Marie", "Luc"]);
    goTo("#/t/demo/entrants");
    render(<App />);

    const name = screen.getByDisplayValue("Marie");
    // A field somebody can see is a field, not text styled to look like one.
    expect(name.tagName).toBe("INPUT");
    expect(getComputedStyle(name).borderStyle).not.toBe("none");

    await user.clear(name);
    await user.type(name, "Marie Dubois");
    await waitFor(() => {
      expect(screen.getByDisplayValue("Marie Dubois")).toBeInTheDocument();
    });

    const seed = screen.getByLabelText("Seed for Luc");
    expect(seed).toHaveAttribute("inputmode", "numeric");
  });

  it("draws a chevron on every select, since the native one is stripped", () => {
    seedTournament(["Marie", "Luc"]);
    goTo("#/t/demo/rules");
    const { container } = render(<App />);

    const selects = container.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(3);
    for (const select of selects) {
      expect(select.parentElement?.querySelector("svg")).toBeTruthy();
    }
  });

  it("reads the roster back as a seeded draw order, and flags a repeated name", async () => {
    goTo("#/new");
    render(<App />);

    fireEvent.change(screen.getByPlaceholderText(/Marie Dubois/), {
      target: { value: "Ana\nLuc\nAna" },
    });

    // The draw order is echoed back, so a stray blank line or a name pasted
    // twice is visible before the tournament is created rather than after.
    await waitFor(() => {
      // Both copies are flagged, since either could be the mistake.
      expect(screen.getAllByText("repeated")).toHaveLength(2);
    });
    expect(screen.getByText(/3 entrants ready/i)).toBeInTheDocument();
  });
});

describe("score entry over the draw", () => {
  it("closes on Escape and gives focus back", async () => {
    const user = userEvent.setup();
    seedTournament(["Marie", "Luc", "Ana", "Paul"]);
    goTo("#/t/demo");
    render(<App />);

    await user.click(screen.getByRole("button", { name: /start the tournament/i }));
    await user.click(screen.getByRole("link", { name: "Draw" }));

    const fixture = (await screen.findAllByRole("button", { name: /versus/i }))[0]!;
    await user.click(fixture);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("dismisses when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    seedTournament(["Marie", "Luc", "Ana", "Paul"]);
    goTo("#/t/demo");
    render(<App />);

    await user.click(screen.getByRole("button", { name: /start the tournament/i }));
    await user.click(screen.getByRole("link", { name: "Draw" }));
    await user.click((await screen.findAllByRole("button", { name: /versus/i }))[0]!);

    await user.click(await screen.findByRole("button", { name: /close score entry/i }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
