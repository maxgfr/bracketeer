/**
 * The panels a coverage run showed were barely exercised.
 *
 * Score entry mattered most: four of the five ways of recording a result had no
 * test at all, and entering a result is the thing this app exists to do.
 */

import {
  addEntrant,
  appendEvent,
  createTournament,
  startStage,
  replay,
  type DomainEvent,
  type EventEnvelope,
  type TournamentConfigInput,
} from "@bracketeer/engine";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App.js";
import { decode, encode } from "../src/lib/codec.js";
import { PeerBar, type PeerState } from "../src/sync/PeerBar.js";

/** Write a tournament into storage without rendering anything. */
function seed(
  config: TournamentConfigInput,
  names: string[],
  tab = "",
  { started = true }: { started?: boolean } = {},
) {
  const at = 1_700_000_000_000;
  let log: EventEnvelope[] = [];
  const add = (event: DomainEvent) => {
    log = appendEvent(log, "test", event, at + log.length);
  };

  add(createTournament({ name: "Club Open", config, seed: 42, createdAt: new Date(at).toISOString() }));
  names.forEach((name, i) => add(addEntrant({ id: `e${i}`, name, seed: i + 1 })));

  if (started) {
    const first = replay(log).config.stages[0];
    if (first) for (const event of startStage(replay(log), first.id)) add(event);
  }

  localStorage.setItem("bracketeer.log.demo", JSON.stringify(log));
  localStorage.setItem(
    "bracketeer.index",
    JSON.stringify([{ id: "demo", name: "Club Open", updatedAt: at, entrants: names.length }]),
  );

  window.location.hash = tab ? `#/t/demo/${tab}` : "#/t/demo";
}

/** Seed a tournament and open it at a given tab. */
function open(
  config: TournamentConfigInput,
  names: string[],
  tab = "",
  options: { started?: boolean } = {},
) {
  seed(config, names, tab, options);
  return render(<App />);
}

const four = ["Ana", "Ben", "Cleo", "Dan"];

/** Build a tournament log without writing it anywhere. */
function seedLog(config: TournamentConfigInput, names: string[]) {
  seed(config, names);
  const log = JSON.parse(localStorage.getItem("bracketeer.log.demo") as string);
  return log as EventEnvelope[];
}

/** Read the tournament back out of a share link, as the receiving device does. */
function decodePayload(url: string) {
  const data = /[?&]d=([^&]+)/.exec(url)?.[1] ?? "";
  return decode(data);
}

describe("recording a result, in every shape the rules can take", () => {
  it("takes a score for each side", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points", target: 13 } }, four);

    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);
    await user.type(screen.getByLabelText("Score for Ana"), "13");
    await user.type(screen.getByLabelText("Score for Dan"), "9");
    await user.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() => expect(screen.getByText(/1 played/i)).toBeInTheDocument());
  });

  it("takes a set-by-set scoreline, and drops the sets nobody played", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "sets", bestOf: 3 } }, four);

    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);

    // Two sets is a complete best-of-three; the third must not be demanded.
    await user.type(screen.getByLabelText("Set 1, Ana"), "11");
    await user.type(screen.getByLabelText("Set 1, Dan"), "6");
    await user.type(screen.getByLabelText("Set 2, Ana"), "11");
    await user.type(screen.getByLabelText("Set 2, Dan"), "8");
    await user.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() => expect(screen.getByText(/1 played/i)).toBeInTheDocument());
  });

  it("refuses a half-filled set rather than guessing", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "sets", bestOf: 3 } }, four);

    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);
    await user.type(screen.getByLabelText("Set 1, Ana"), "11");
    await user.click(screen.getByRole("button", { name: "Record" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/both scores/i);
  });

  it("takes a bare verdict, including a draw", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "outcome", allowDraw: true } }, four);

    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);
    expect(screen.getByRole("button", { name: "Draw" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ana wins/ }));

    await waitFor(() => expect(screen.getByText(/1 played/i)).toBeInTheDocument());
  });

  it("offers no draw when the rules do not allow one", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "outcome", allowDraw: false } }, four);

    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);
    expect(screen.queryByRole("button", { name: "Draw" })).not.toBeInTheDocument();
  });

  it("takes a finishing order by tapping the names in order", async () => {
    const user = userEvent.setup();
    open(
      {
        match: { sidesPerMatch: 4 },
        score: { kind: "placement", pointsByPlace: [10, 6, 4, 2] },
        pairing: { strategy: "random" },
        stages: [{ kind: "swiss", id: "heats", rounds: 1 }],
      },
      four,
    );

    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);

    // Recording is blocked until the whole order is given.
    expect(screen.getByRole("button", { name: "Record" })).toBeDisabled();

    for (const name of ["Ana", "Ben", "Cleo", "Dan"]) {
      await user.click(screen.getByRole("button", { name }));
    }
    expect(screen.getByRole("button", { name: "Record" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() => expect(screen.getByText(/1 played/i)).toBeInTheDocument());
  });

  it("lets a mis-tapped finishing order be taken back", async () => {
    const user = userEvent.setup();
    open(
      {
        match: { sidesPerMatch: 4 },
        score: { kind: "placement" },
        pairing: { strategy: "random" },
        stages: [{ kind: "swiss", id: "heats", rounds: 1 }],
      },
      four,
    );

    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);
    await user.click(screen.getByRole("button", { name: "Ana" }));
    // The control strip has an Undo of its own; this is the one on the row.
    const rowUndo = screen.getAllByRole("button", { name: "Undo" });
    await user.click(rowUndo[rowUndo.length - 1]!);

    // Back in the pool of names to choose from.
    await waitFor(() => expect(screen.getByRole("button", { name: "Ana" })).toBeInTheDocument());
  });

  it("takes times, and records a competitor who did not finish", async () => {
    const user = userEvent.setup();
    open(
      {
        match: { sidesPerMatch: 4 },
        score: { kind: "time", lowerIsBetter: true },
        pairing: { strategy: "random" },
        stages: [{ kind: "swiss", id: "heats", rounds: 1 }],
      },
      four,
    );

    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);
    await user.type(screen.getByLabelText("Time for Ana"), "12.4");
    await user.type(screen.getByLabelText("Time for Ben"), "11.9");
    // Cleo and Dan are left blank: they did not finish.
    await user.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() => expect(screen.getByText(/1 played/i)).toBeInTheDocument());
  });

  it("will not accept a heat where nobody finished", async () => {
    const user = userEvent.setup();
    open(
      {
        match: { sidesPerMatch: 4 },
        score: { kind: "time" },
        pairing: { strategy: "random" },
        stages: [{ kind: "swiss", id: "heats", rounds: 1 }],
      },
      four,
    );

    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);
    await user.click(screen.getByRole("button", { name: "Record" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/at least one/i);
  });

  it("lets a result already entered be corrected", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points", target: 13 } }, four);

    await user.click((await screen.findAllByRole("button", { name: /enter the score/i }))[0]!);
    await user.type(screen.getByLabelText("Score for Ana"), "13");
    await user.type(screen.getByLabelText("Score for Dan"), "9");
    await user.click(screen.getByRole("button", { name: "Record" }));

    await waitFor(() => expect(screen.getByText(/1 played/i)).toBeInTheDocument());
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]!);

    expect(await screen.findByRole("button", { name: "Record" })).toBeInTheDocument();
  });
});

describe("the calendar", () => {
  const scheduled = { score: { kind: "points" as const } };

  it("lays fixtures out across the courts it is given", async () => {
    const user = userEvent.setup();
    open(scheduled, four, "calendar");

    await user.type(screen.getByLabelText(/first fixture starts/i), "2026-06-01T09:00");
    fireEvent.change(screen.getByLabelText(/courts/i), { target: { value: "Court 1\nCourt 2" } });
    await user.click(screen.getByRole("button", { name: /lay out the schedule/i }));

    // Two semi-finals on two courts at nine o'clock. The names also sit in the
    // textarea they were typed into, so look only at the fixture list.
    await waitFor(() => {
      const listed = screen
        .getAllByRole("listitem")
        .map((li) => li.textContent ?? "")
        .join(" ");
      expect(listed).toContain("Court 1");
      expect(listed).toContain("Court 2");
    });
  });

  it("says so when there is nothing scheduled yet", () => {
    open(scheduled, four, "calendar");
    expect(screen.getByText(/nothing is scheduled/i)).toBeInTheDocument();
  });

  it("offers the calendar file only once there is something to put in it", async () => {
    const user = userEvent.setup();
    open(scheduled, four, "calendar");

    expect(screen.getByRole("button", { name: /download \.ics/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/first fixture starts/i), "2026-06-01T09:00");
    await user.click(screen.getByRole("button", { name: /lay out the schedule/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /download \.ics/i })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: /download \.ics/i }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });
});

describe("sharing, by who it is for", () => {
  it("asks who the link is for before giving you one", () => {
    open({ score: { kind: "points" } }, four, "share");

    expect(screen.getByText(/who is this for/i)).toBeInTheDocument();
    expect(screen.getByText("Someone watching")).toBeInTheDocument();
    expect(screen.getByText("Someone helping run it")).toBeInTheDocument();
  });

  it("gives a watch link by default, with no key in it", () => {
    open({ score: { kind: "points" } }, four, "share");

    const link = screen.getByLabelText(/watch link/i) as HTMLInputElement;
    expect(link.value).toContain("#/t/demo?d=");
    // No key means the holder cannot push changes to anybody.
    expect(link.value).not.toContain("&k=");
  });

  it("puts the key in the organiser link, and warns what that means", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "share");

    await user.click(screen.getByText("Someone helping run it"));

    const link = (await screen.findByLabelText(/organiser link/i)) as HTMLInputElement;
    expect(link.value).toContain("&k=");
    expect(screen.getByText(/lets whoever opens it enter scores/i)).toBeInTheDocument();
  });

  it("copies whichever link is showing", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "share");

    const buttons = screen.getAllByRole("button", { name: /copy link/i });
    await user.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
  });

  it("downloads a file for whichever audience is selected", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "share");

    await user.click(screen.getByRole("button", { name: /download as a file/i }));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("offers embed code pointing at the read-only view", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "share");

    const embed = screen.getByLabelText(/paste into your page/i) as HTMLTextAreaElement;
    expect(embed.value).toContain("<iframe");
    expect(embed.value).toContain("#/embed/demo?d=");

    await user.click(screen.getByRole("button", { name: /copy embed code/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument());
  });

  it("states plainly what live depends on", () => {
    open({ score: { kind: "points" } }, four, "share");
    expect(screen.getByText(/no server behind this/i)).toBeInTheDocument();
    expect(screen.getByText(/only works while at least one of you/i)).toBeInTheDocument();
  });
});

describe("private fields", () => {
  const withPrivate = {
    score: { kind: "points" as const },
    entrantFields: [
      { key: "affiliation", label: "Club" },
      { key: "phone", label: "Phone", private: true },
    ],
  };

  it("leaves a private value out of the watch link entirely", async () => {
    seed(withPrivate, four, "entrants", { started: false });

    // Put a phone number against somebody.
    const raw = JSON.parse(localStorage.getItem("bracketeer.log.demo") as string);
    raw.push({
      id: "test:99",
      actor: "test",
      seq: 99,
      lamport: 99,
      at: 1_700_000_009_999,
      event: { type: "entrant_updated", id: "e0", patch: { meta: { phone: "0612345678" } } },
    });
    localStorage.setItem("bracketeer.log.demo", JSON.stringify(raw));

    window.location.hash = "#/t/demo/share";
    render(<App />);

    const watch = (await screen.findByLabelText(/watch link/i)) as HTMLInputElement;
    const carried = JSON.stringify(decodePayload(watch.value));
    expect(carried).not.toContain("0612345678");

    // And says so, rather than leaving the organiser to hope.
    expect(screen.getByText(/not in this link at all/i)).toBeInTheDocument();
  });

  it("keeps it in the organiser link, which is the point of having one", async () => {
    const user = userEvent.setup();
    seed(withPrivate, four, "entrants", { started: false });

    const raw = JSON.parse(localStorage.getItem("bracketeer.log.demo") as string);
    raw.push({
      id: "test:99",
      actor: "test",
      seq: 99,
      lamport: 99,
      at: 1_700_000_009_999,
      event: { type: "entrant_updated", id: "e0", patch: { meta: { phone: "0612345678" } } },
    });
    localStorage.setItem("bracketeer.log.demo", JSON.stringify(raw));

    window.location.hash = "#/t/demo/share";
    render(<App />);

    await user.click(screen.getByText("Someone helping run it"));
    const link = (await screen.findByLabelText(/organiser link/i)) as HTMLInputElement;
    const carried = JSON.stringify(decodePayload(link.value));
    expect(carried).toContain("0612345678");
  });

  it("names the private field where the watch link is described", () => {
    seed(withPrivate, four, "share");
    render(<App />);
    expect(screen.getByText(/phone .*(is|are) removed/i)).toBeInTheDocument();
  });
});

describe("the standings", () => {
  it("shows how ties are broken, in the order they apply", () => {
    open(
      {
        score: { kind: "points" },
        standings: { tiebreakers: [{ key: "wins" }, { key: "buchholz" }] },
      },
      four,
      "standings",
    );

    expect(screen.getByText(/how ties are broken/i)).toBeInTheDocument();
    expect(screen.getByText(/strength of the opponents you faced/i)).toBeInTheDocument();
  });

  it("gives every group its own table", () => {
    open(
      {
        score: { kind: "points" },
        stages: [
          {
            kind: "groups",
            id: "groups",
            groupCount: 2,
            inner: { kind: "round_robin" },
            qualification: { perGroup: 1 },
          },
        ],
      },
      four,
      "standings",
    );

    expect(screen.getByText("Group A")).toBeInTheDocument();
    expect(screen.getByText("Group B")).toBeInTheDocument();
    expect(screen.getAllByRole("table")).toHaveLength(2);
  });

  it("says what is missing before anything is played", () => {
    open({ score: { kind: "points" } }, four, "standings", { started: false });
    expect(screen.getByText(/no table yet/i)).toBeInTheDocument();
  });
});

describe("the draw", () => {
  it("draws the bracket, with a fixture for every pairing", async () => {
    open({ score: { kind: "points" } }, four, "draw");
    // Two semi-finals and a final, each labelled for a screen reader.
    expect(await screen.findAllByRole("button", { name: /versus/i })).toHaveLength(2);
  });

  it("lists rounds instead of a tree when nothing feeds forward", () => {
    open(
      {
        score: { kind: "points" },
        pairing: { strategy: "closest_record" },
        stages: [{ kind: "swiss", id: "main", rounds: 2 }],
      },
      four,
      "draw",
    );
    expect(screen.getByText("Round 1")).toBeInTheDocument();
  });

  it("says what to do before the draw is made", () => {
    open({ score: { kind: "points" } }, four, "draw", { started: false });
    expect(screen.getByText(/draw has not been made/i)).toBeInTheDocument();
  });
});

describe("the entry list", () => {
  it("adds several entrants at once", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "entrants", { started: false });

    fireEvent.change(screen.getByPlaceholderText(/Marie Dubois/), {
      target: { value: "Eve\nFinn" },
    });
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(screen.getByDisplayValue("Eve")).toBeInTheDocument());
    expect(screen.getByDisplayValue("Finn")).toBeInTheDocument();
  });

  it("adds a custom field, which then appears against every entrant", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "entrants", { started: false });

    await user.type(screen.getByLabelText(/new field/i), "Country");
    await user.click(screen.getByRole("button", { name: /add field/i }));

    await waitFor(() =>
      expect(screen.getAllByPlaceholderText("Country").length).toBeGreaterThan(1),
    );
  });

  it("warns that late entrants only join the next round", () => {
    open({ score: { kind: "points" } }, four, "entrants");
    expect(screen.getByText(/draw has already been made/i)).toBeInTheDocument();
  });

  it("will not remove somebody once they are in the draw", () => {
    open({ score: { kind: "points" } }, four, "entrants");
    // Withdrawing keeps their results; removing would rewrite history.
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Withdraw" }).length).toBeGreaterThan(0);
  });
});

describe("the rules", () => {
  it("changes the score kind, and the entry form follows", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    await user.selectOptions(screen.getByLabelText(/a result is recorded as/i), "outcome");

    window.location.hash = "#/t/demo";
    await waitFor(() =>
      expect(screen.queryByLabelText(/played to/i)).not.toBeInTheDocument(),
    );
  });

  it("reorders a tiebreaker, and reverses its direction", async () => {
    const user = userEvent.setup();
    open(
      {
        score: { kind: "points" },
        standings: { tiebreakers: [{ key: "points" }, { key: "point_diff" }] },
      },
      four,
      "rules",
    );

    await user.click(screen.getAllByRole("button", { name: "↑" })[1]!);
    await waitFor(() =>
      expect(screen.getByLabelText("Tiebreaker 1")).toHaveValue("point_diff"),
    );

    await user.click(screen.getAllByRole("button", { name: /high first/i })[0]!);
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /low first/i }).length).toBeGreaterThan(0),
    );
  });

  it("removes a tiebreaker and adds one", async () => {
    const user = userEvent.setup();
    open(
      { score: { kind: "points" }, standings: { tiebreakers: [{ key: "points" }] } },
      four,
      "rules",
    );

    await user.click(screen.getByRole("button", { name: /add a tiebreaker/i }));
    await waitFor(() => expect(screen.getByLabelText("Tiebreaker 2")).toBeInTheDocument());

    await user.click(screen.getAllByRole("button", { name: "×" })[1]!);
    await waitFor(() => expect(screen.queryByLabelText("Tiebreaker 2")).not.toBeInTheDocument());
  });

  it("switches the rating system on and off", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" }, rating: { system: "none" } }, four, "rules");

    await user.selectOptions(screen.getByLabelText(/^system$/i), "elo");
    await waitFor(() => expect(screen.getByLabelText(/k-factor/i)).toBeInTheDocument());
  });

  it("warns that changing the rules will not redraw what has been played", () => {
    open({ score: { kind: "points" } }, four, "rules");
    expect(screen.getByText(/will not redraw what has been played/i)).toBeInTheDocument();
  });
});

describe("the embedded view", () => {
  it("shows the table and no controls at all", async () => {
    seed({ score: { kind: "points" } }, four);
    window.location.hash = "#/embed/demo";
    render(<App />);

    const headings = await screen.findAllByRole("heading", { level: 1 });
    expect(headings.some((h) => h.textContent === "Club Open")).toBe(true);
    expect(screen.queryByRole("button", { name: /go live/i })).not.toBeInTheDocument();
  });

  it("says so when the link carries nothing it can read", () => {
    window.location.hash = "#/embed/missing";
    render(<App />);
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });
});

describe("an address that does not exist", () => {
  it("explains that shared links are long and may have been cut", () => {
    window.location.hash = "#/nonsense";
    render(<App />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/nothing at this address/i);
    expect(screen.getByRole("link", { name: /back to the start/i })).toBeInTheDocument();
  });
});

describe("appearance", () => {
  it("cycles between following the system, light and dark", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/";
    render(<App />);

    const toggle = screen.getByTitle(/appearance/i);
    expect(toggle).toHaveTextContent("Auto");

    await user.click(toggle);
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));

    await user.click(screen.getByTitle(/appearance/i));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("dark"));

    await user.click(screen.getByTitle(/appearance/i));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBeUndefined());
  });
});

describe("the shape diagram", () => {
  it("is drawn for the chosen shape, and described for a screen reader", async () => {
    window.location.hash = "#/new";
    render(<App />);

    const diagrams = await screen.findAllByRole("img");
    expect(diagrams.length).toBeGreaterThan(5);
    // Every one says what it shows, since the drawing carries no words.
    for (const diagram of diagrams.slice(0, 5)) {
      expect(diagram).toHaveAttribute("aria-label", expect.stringContaining("Structure"));
    }
  });

  it("shows a knockout narrowing round by round", async () => {
    window.location.hash = "#/new";
    const { container } = render(<App />);

    await screen.findAllByRole("img");
    const first = container.querySelector("svg");
    // Four rounds of a sixteen-entrant knockout, so the drawing has real lines.
    expect(first?.querySelectorAll("line").length ?? 0).toBeGreaterThan(8);
  });
});

describe("what a table shows", () => {
  it("marks who is on course to qualify", () => {
    open(
      {
        score: { kind: "points" },
        stages: [
          {
            kind: "groups",
            id: "groups",
            groupCount: 2,
            inner: { kind: "round_robin" },
            qualification: { perGroup: 1 },
          },
        ],
      },
      four,
      "standings",
    );

    const table = screen.getAllByRole("table")[0]!;
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
  });
});

describe("every dial on the rules tab", () => {
  it("changes what an entrant is", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    await user.selectOptions(screen.getByLabelText(/what one competitor/i), "drawn_team");
    await waitFor(() =>
      expect(screen.getByLabelText(/what one competitor/i)).toHaveValue("drawn_team"),
    );

    await user.selectOptions(screen.getByLabelText(/what one competitor/i), "fixed_team");
    await waitFor(() => expect(screen.getByLabelText(/what one competitor/i)).toHaveValue("fixed_team"));
  });

  it("changes how many are in a match at once", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    fireEvent.change(screen.getByLabelText(/sides per fixture/i), { target: { value: "4" } });
    await waitFor(() =>
      expect(screen.getByLabelText(/sides per fixture/i)).toHaveValue("4"),
    );
    void user;
  });

  it("turns home advantage on", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    const toggle = screen.getByLabelText(/one side is at home/i);
    await user.click(toggle);
    await waitFor(() => expect(screen.getByLabelText(/one side is at home/i)).toBeChecked());
  });

  it("sets a target score, and clears it again", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    fireEvent.change(screen.getByLabelText(/played to/i), { target: { value: "13" } });
    await waitFor(() => expect(screen.getByLabelText(/played to/i)).toHaveValue("13"));

    fireEvent.change(screen.getByLabelText(/played to/i), { target: { value: "" } });
    await waitFor(() => expect(screen.getByLabelText(/played to/i)).toHaveValue(""));
    void user;
  });

  it("switches to sets, and takes a best-of", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    await user.selectOptions(screen.getByLabelText(/a result is recorded as/i), "sets");
    fireEvent.change(await screen.findByLabelText(/best of/i), { target: { value: "5" } });
    await waitFor(() => expect(screen.getByLabelText(/best of/i)).toHaveValue("5"));
  });

  it("switches to a finishing order, and takes a points table", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    await user.selectOptions(screen.getByLabelText(/a result is recorded as/i), "placement");
    const table = await screen.findByLabelText(/points by finishing place/i);
    fireEvent.change(table, { target: { value: "10, 6, 4" } });
    await waitFor(() => expect(screen.getByLabelText(/points by finishing place/i)).toHaveValue("10, 6, 4"));
  });

  it("switches to a time, and flips which direction wins", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    await user.selectOptions(screen.getByLabelText(/a result is recorded as/i), "time");
    const higher = await screen.findByLabelText(/higher figure is better/i);
    await user.click(higher);
    await waitFor(() => expect(screen.getByLabelText(/higher figure is better/i)).toBeChecked());
  });

  it("changes the pairing strategy and who sits out", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    await user.selectOptions(screen.getByLabelText(/how each round is drawn/i), "closest_rating");
    await waitFor(() => expect(screen.getByLabelText(/how each round is drawn/i)).toHaveValue("closest_rating"));

    await user.selectOptions(screen.getByLabelText(/who sits out/i), "highest_ranked");
    await waitFor(() => expect(screen.getByLabelText(/who sits out/i)).toHaveValue("highest_ranked"));
  });

  it("turns each pairing constraint on and off", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    const rematch = screen.getByLabelText(/avoid repeating a fixture/i);
    expect(rematch).toBeChecked();
    await user.click(rematch);
    await waitFor(() => expect(screen.getByLabelText(/avoid repeating a fixture/i)).not.toBeChecked());

    await user.click(screen.getByLabelText(/keep entrants who share a field apart/i));
    await waitFor(() =>
      expect(screen.getByLabelText(/keep entrants who share a field apart/i)).toBeChecked(),
    );

    await user.click(screen.getByLabelText(/spread byes around/i));
    await waitFor(() => expect(screen.getByLabelText(/spread byes around/i)).not.toBeChecked());
  });

  it("changes what a win is worth", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    fireEvent.change(screen.getByLabelText("A win"), { target: { value: "3" } });
    await waitFor(() => expect(screen.getByLabelText("A win")).toHaveValue("3"));
    void user;
  });

  it("switches where league points come from", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    await user.selectOptions(screen.getByLabelText(/points come from/i), "score");
    await waitFor(() => expect(screen.getByLabelText(/points come from/i)).toHaveValue("score"));
  });

  it("gives strong entrants a head start", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    await user.selectOptions(screen.getByLabelText(/head start/i), "rating_band");
    await waitFor(() => expect(screen.getByLabelText(/head start/i)).toHaveValue("rating_band"));
  });

  it("weights Elo by the margin of victory", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" }, rating: { system: "elo" } }, four, "rules");

    await user.click(screen.getByLabelText(/weight by margin of victory/i));
    await waitFor(() =>
      expect(screen.getByLabelText(/weight by margin of victory/i)).toBeChecked(),
    );
  });

  it("describes what losing costs, for each policy", () => {
    open(
      {
        score: { kind: "points" },
        stages: [{ kind: "single_elimination", id: "m", consolation: "full_consolation" }],
      },
      four,
      "rules",
    );
    expect(screen.getByText(/consolation bracket for everyone beaten in round one/i)).toBeInTheDocument();
  });

  it("applies a hand-edited configuration, and reverts one", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "rules");

    const raw = screen.getByLabelText(/raw tournament configuration/i) as HTMLTextAreaElement;
    const edited = JSON.parse(raw.value);
    edited.match.sidesPerMatch = 3;
    fireEvent.change(raw, { target: { value: JSON.stringify(edited, null, 2) } });

    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(screen.getByText("Applied.")).toBeInTheDocument());
    expect(screen.getByLabelText(/sides per fixture/i)).toHaveValue("3");

    fireEvent.change(raw, { target: { value: "{ nonsense" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled());

    await user.click(screen.getByRole("button", { name: "Revert" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled());
  });
});

describe("opening a tournament from a file", () => {
  it("reads an export and opens it", async () => {
    const user = userEvent.setup();
    seed({ score: { kind: "points" } }, four);
    const log = localStorage.getItem("bracketeer.log.demo") as string;
    localStorage.clear();

    window.location.hash = "#/";
    render(<App />);

    const file = new File(
      [JSON.stringify({ format: "bracketeer", version: 1, exportedAt: "", log: JSON.parse(log) })],
      "t.json",
      { type: "application/json" },
    );
    await user.upload(screen.getByLabelText(/open a tournament file/i), file);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Club Open"),
    );
  });

  it("says what is wrong with a file it cannot read", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/";
    render(<App />);

    const file = new File(["not a tournament"], "x.json", { type: "application/json" });
    await user.upload(screen.getByLabelText(/open a tournament file/i), file);

    expect(await screen.findByText(/exported from Bracketeer/i)).toBeInTheDocument();
  });

  it("forgets a tournament when asked", async () => {
    const user = userEvent.setup();
    seed({ score: { kind: "points" } }, four);
    window.location.hash = "#/";
    render(<App />);

    await user.click(screen.getByRole("button", { name: /remove club open/i }));
    await waitFor(() => expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument());
  });
});

describe("when the browser refuses to save", () => {
  it("says the tournament will be lost, rather than failing silently", async () => {
    seed({ score: { kind: "points" } }, four);

    // Private browsing and a full quota both throw on write.
    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/browser is refusing to save/i)).toBeInTheDocument(),
    );

    setItem.mockRestore();
  });
});

describe("the live-sync indicator", () => {
  const state = (over: Partial<PeerState> = {}): PeerState => ({
    status: "off",
    count: 0,
    error: null,
    start: () => undefined,
    stop: () => undefined,
    ...over,
  });

  it("shows nothing at all when sync is off", () => {
    const { container } = render(<PeerBar peers={state()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says it is connecting", () => {
    render(<PeerBar peers={state({ status: "connecting" })} />);
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
  });

  it("distinguishes connected-and-alone from connected-to-somebody", () => {
    const { rerender } = render(<PeerBar peers={state({ status: "live" })} />);
    expect(screen.getByText("Live · waiting")).toBeInTheDocument();

    rerender(<PeerBar peers={state({ status: "live", count: 1 })} />);
    expect(screen.getByText("Live · 1 device")).toBeInTheDocument();

    rerender(<PeerBar peers={state({ status: "live", count: 3 })} />);
    expect(screen.getByText("Live · 3 devices")).toBeInTheDocument();
  });

  it("says when the network will not carry it, and carries the reason", () => {
    render(
      <PeerBar peers={state({ status: "unavailable", error: "Blocked by this network." })} />,
    );
    expect(screen.getByText("Sync unavailable")).toBeInTheDocument();
    expect(screen.getByTitle("Blocked by this network.")).toBeInTheDocument();
  });
});

describe("opening a shared link when you already have the tournament", () => {
  /**
   * The flow that matters most, and the one that used to lose work: two people
   * running the same tournament from the same link. The link is a snapshot, and
   * treating it as the truth throws away whatever the person opening it has
   * done since.
   */
  function tournamentLog(names: string[]) {
    const at = 1_700_000_000_000;
    let log: EventEnvelope[] = [];
    const add = (event: DomainEvent) => {
      log = appendEvent(log, "organiser", event, at + log.length);
    };
    add(
      createTournament({
        name: "Club Open",
        config: { score: { kind: "points", target: 13 } },
        seed: 42,
        createdAt: new Date(at).toISOString(),
      }),
    );
    names.forEach((name, i) => add(addEntrant({ id: `e${i}`, name, seed: i + 1 })));
    for (const event of startStage(replay(log), "main")) add(event);
    return log;
  }

  it("keeps scores entered locally when the link is opened again", async () => {
    const shared = tournamentLog(four);

    // This device has already recorded a result the link knows nothing about.
    const match = replay(shared).matches.find((m) => m.status === "ready")!;
    const local = appendEvent(
      shared,
      "this-device",
      { type: "result_reported", matchId: match.id, result: { kind: "points", scores: [13, 4] } },
      Date.now(),
    );
    localStorage.setItem("bracketeer.log.demo", JSON.stringify(local));

    // Now the older link arrives again — pasted in a chat an hour ago.
    window.location.hash = `#/t/demo?d=${encode(shared)}`;
    render(<App />);

    await screen.findByRole("heading", { level: 1 });
    // The result survives: one played, not none.
    await waitFor(() => expect(screen.getByText(/1 played/i)).toBeInTheDocument());
  });

  it("takes in what the link knows that this device does not", async () => {
    const shared = tournamentLog(four);
    const match = replay(shared).matches.find((m) => m.status === "ready")!;

    // The link is ahead: it carries a result this device has never seen.
    const ahead = appendEvent(
      shared,
      "organiser",
      { type: "result_reported", matchId: match.id, result: { kind: "points", scores: [13, 9] } },
      Date.now(),
    );
    localStorage.setItem("bracketeer.log.demo", JSON.stringify(shared));

    window.location.hash = `#/t/demo?d=${encode(ahead)}`;
    render(<App />);

    await waitFor(() => expect(screen.getByText(/1 played/i)).toBeInTheDocument());
  });

  it("combines both sides when each has something the other lacks", async () => {
    const shared = tournamentLog(four);
    const ready = replay(shared).matches.filter((m) => m.status === "ready");
    expect(ready.length).toBeGreaterThanOrEqual(2);

    const mine = appendEvent(
      shared,
      "this-device",
      { type: "result_reported", matchId: ready[0]!.id, result: { kind: "points", scores: [13, 4] } },
      1_700_000_100_000,
    );
    const theirs = appendEvent(
      shared,
      "organiser",
      { type: "result_reported", matchId: ready[1]!.id, result: { kind: "points", scores: [13, 6] } },
      1_700_000_100_001,
    );

    localStorage.setItem("bracketeer.log.demo", JSON.stringify(mine));
    window.location.hash = `#/t/demo?d=${encode(theirs)}`;
    render(<App />);

    // Both results are present, so the round is complete and the next can be drawn.
    await waitFor(() => expect(screen.getByText(/2 played/i)).toBeInTheDocument());
  });

  it("still opens a link for a tournament this device has never seen", async () => {
    const shared = tournamentLog(four);
    window.location.hash = `#/t/brand-new?d=${encode(shared)}`;
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Club Open"),
    );
    expect(screen.getByText(/4 entrants/)).toBeInTheDocument();
  });
});


describe("naming a tournament at creation", () => {
  it("suggests a name, year-stamped, and a different one each press", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/new";
    render(<App />);

    const field = screen.getByPlaceholderText(/straight knockout/i) as HTMLInputElement;
    await user.click(screen.getByRole("button", { name: /suggest a name/i }));

    const first = field.value;
    expect(first).toContain(String(new Date().getFullYear()));

    await user.click(screen.getByRole("button", { name: /suggest a name/i }));
    expect(field.value).not.toBe(first);
  });

  it("numbers an unnamed tournament rather than repeating one already here", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/new";
    render(<App />);

    // Leaving the name blank falls back to the shape's name, with a year on it.
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        new RegExp(String(new Date().getFullYear())),
      ),
    );
  });
});

describe("starting from a sport", () => {
  it("offers sports as a second list, each naming the shape it is", () => {
    window.location.hash = "#/new";
    render(<App />);

    expect(screen.getByText(/or start from a sport/i)).toBeInTheDocument();
    expect(screen.getByText("Rugby union")).toBeInTheDocument();
    expect(screen.getAllByText(/^Shape: /).length).toBeGreaterThan(10);
  });

  it("says plainly that a sport is a shape with the settings filled in", () => {
    window.location.hash = "#/new";
    render(<App />);
    expect(screen.getByText(/none of these is a mode/i)).toBeInTheDocument();
  });

  it("creates a tournament with the sport's rules", async () => {
    const user = userEvent.setup();
    window.location.hash = "#/new";
    render(<App />);

    // Several sports run a league season; take rugby's.
    await user.click(screen.getByDisplayValue("rugby-season"));
    fireEvent.change(screen.getByPlaceholderText(/Marie Dubois/), {
      target: { value: "Ana\nBen\nCleo\nDan" },
    });
    await user.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/League season/),
    );
    // Two legs of a round robin: everyone meets everyone twice.
    expect(screen.getByText(/round robin/i)).toBeInTheDocument();
  });
});

describe("seeing the structure while editing the rules", () => {
  it("draws what the current configuration builds", async () => {
    open({ score: { kind: "points" } }, four, "rules");

    const drawings = await screen.findAllByRole("img");
    expect(drawings.length).toBeGreaterThan(0);
    expect(drawings[0]).toHaveAttribute("aria-label", expect.stringContaining("Structure"));
  });
});

describe("getting the link at the moment you need it", () => {
  it("offers Copy link from any tab, not only from Share", async () => {
    const user = userEvent.setup();
    open({ score: { kind: "points" } }, four, "standings");

    const copy = screen.getAllByRole("button", { name: /copy link/i })[0]!;
    await user.click(copy);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /link copied/i })).toBeInTheDocument(),
    );
  });

  it("explains that a bare address carries no tournament", () => {
    window.location.hash = "#/t/never-seen";
    render(<App />);

    expect(screen.getByText(/address alone carries no tournament/i)).toBeInTheDocument();
    expect(screen.getByText(/rather than using the Copy link button/i)).toBeInTheDocument();
  });
});

describe("marking a field private", () => {
  it("is a checkbox on the field, and it sticks", async () => {
    const user = userEvent.setup();
    open(
      {
        score: { kind: "points" },
        entrantFields: [{ key: "phone", label: "Phone" }],
      },
      four,
      "entrants",
      { started: false },
    );

    const toggle = screen.getByRole("checkbox");
    expect(toggle).not.toBeChecked();

    await user.click(toggle);
    await waitFor(() => expect(screen.getByRole("checkbox")).toBeChecked());
  });

  it("says what marking it does", () => {
    open({ score: { kind: "points" } }, four, "entrants", { started: false });
    expect(screen.getByText(/not in the watch link at all/i)).toBeInTheDocument();
  });
});

describe("who is allowed to push changes", () => {
  it("treats a watch link as read-only, and hides the organiser's copy button", async () => {
    const log = seedLog({ score: { kind: "points" } }, four);
    localStorage.clear();

    window.location.hash = `#/t/watch-only?d=${encode(log)}`;
    render(<App />);

    await screen.findByRole("heading", { level: 1 });
    // No key in the link means no pushing, so the control that hands one out
    // has no business being there.
    expect(screen.queryByRole("button", { name: /copy link/i })).not.toBeInTheDocument();
  });

  it("treats a tournament made on this device as yours", async () => {
    seed({ score: { kind: "points" } }, four);
    render(<App />);

    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
  });
});
