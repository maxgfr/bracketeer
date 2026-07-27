/**
 * Starting a tournament.
 *
 * One page, not a wizard: a name, a starting point, and the entrants. Every rule
 * can be changed afterwards, so asking six configuration questions before anybody
 * has entered a name would be asking them at the worst possible moment.
 */

import { addEntrant, createTournament, parseConfig } from "@bracketeer/engine";
import { appendEvent, type EventEnvelope } from "@bracketeer/engine";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Masthead } from "../components/Masthead.js";
import { ShapeDiagram } from "../components/ShapeDiagram.js";
import { Button, Field, inputClass, Label, Notice, Section } from "../components/Sheet.js";
import { CATEGORIES, examplesIn, EXAMPLES } from "../lib/examples.js";
import { numberedName, suggestName } from "../lib/names.js";
import { ALL_FORMATS, SPORTS } from "../lib/sports.js";
import { actorId, listTournaments, randomId, randomSeed, saveLog } from "../lib/storage.js";

export function NewTournament() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<{ from: "shape" | "sport"; id: string }>({
    from: "shape",
    id: "knockout",
  });
  const [roster, setRoster] = useState("");
  const [error, setError] = useState<string | null>(null);
  const taken = useMemo(() => listTournaments().map((t) => t.name), []);

  /** Whichever was picked, reduced to the two things creation needs. */
  const chosen = useMemo(() => {
    if (choice.from === "sport") {
      const format = ALL_FORMATS.find((f) => f.id === choice.id);
      const sport = SPORTS.find((s) => s.formats.some((f) => f.id === choice.id));
      return format && sport
        ? { name: `${sport.name} — ${format.name}`, config: format.config }
        : null;
    }
    const shape = EXAMPLES.find((e) => e.id === choice.id);
    return shape ? { name: shape.name, config: shape.config } : null;
  }, [choice]);

  const entrants = useMemo(
    () =>
      roster
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [roster],
  );

  /** Two entrants with the same name are almost always a paste gone wrong. */
  const duplicates = useMemo(() => {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const name of entrants) {
      if (seen.has(name)) repeated.add(name);
      seen.add(name);
    }
    return repeated;
  }, [entrants]);

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    if (!chosen) return;

    const title = name.trim() || numberedName(chosen.name, taken);

    try {
      // Fail here rather than on the tournament page, where the error would have
      // no obvious cause.
      parseConfig(chosen.config);
    } catch {
      setError("That starting point could not be loaded. Please choose another.");
      return;
    }

    const actor = actorId();
    const id = randomId();
    let log: EventEnvelope[] = [];
    const at = Date.now();

    log = appendEvent(
      log,
      actor,
      createTournament({
        name: title,
        config: chosen.config,
        seed: randomSeed(),
        createdAt: new Date(at).toISOString(),
      }),
      at,
    );

    entrants.forEach((entrantName, index) => {
      log = appendEvent(
        log,
        actor,
        addEntrant({ id: randomId(6), name: entrantName, seed: index + 1 }),
        at + index + 1,
      );
    });

    saveLog(id, log, { name: title, entrants: entrants.length });
    navigate(`/t/${id}`);
  };

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24">
      <Masthead />

      <form onSubmit={create} className="mt-8 space-y-10">
        <Section label="The tournament">
          <div className="grid gap-5 py-5 sm:grid-cols-2">
            <Field label="Name" hint="Shown on the sheet and in the calendar export.">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={chosen ? numberedName(chosen.name, taken) : "Spring Open"}
                className={inputClass}
                autoFocus
              />
            </Field>
            <div className="flex items-end pb-1">
              <Button onClick={() => setName(suggestName(name, taken))}>Suggest a name</Button>
            </div>
          </div>
        </Section>

        <Section label="Shape" meta="Every rule can be changed afterwards">
          <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
            These are shapes, not sports. Nothing here knows what you play — two events that look
            nothing alike are usually the same shape with a couple of settings changed, and those
            settings are all on the Rules tab. Pick whichever shape is closest.
          </p>

          <div role="radiogroup" aria-label="Shape">
            {CATEGORIES.map((category) => {
              const options = examplesIn(category.id);
              if (options.length === 0) return null;

              return (
                <div key={category.id} className="mt-6 first:mt-0">
                  <h3 className="sheet-label text-ink">{category.title}</h3>
                  <p className="text-ink-2 mt-1 max-w-[68ch] text-sm leading-snug">
                    {category.blurb}
                  </p>

                  <div className="mt-2">
                    {options.map((option) => {
                      const selected = choice.from === "shape" && option.id === choice.id;
                      return (
                        <label
                          key={option.id}
                          className={`border-rule flex cursor-pointer items-start gap-3 border-b py-3 transition-colors ${
                            selected ? "bg-paper-sunk" : "hover:bg-paper-sunk"
                          } has-focus-visible:outline-focus has-focus-visible:outline-2 has-focus-visible:outline-offset-2`}
                        >
                          {/*
                            The native control is hidden but still focusable, so
                            the row carries the focus ring on its behalf —
                            otherwise keyboard users would be moving through an
                            invisible selection.
                          */}
                          <input
                            type="radio"
                            name="example"
                            value={option.id}
                            checked={selected}
                            onChange={() => setChoice({ from: "shape", id: option.id })}
                            className="sr-only"
                          />
                          <span
                            aria-hidden
                            className={`mt-1.5 inline-block size-2.5 shrink-0 rounded-[1px] ${
                              selected ? "bg-signal" : "border-rule-strong border opacity-40"
                            }`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                              <span
                                className={`text-sm ${selected ? "text-ink font-semibold" : "text-ink font-medium"}`}
                              >
                                {option.name}
                              </span>
                              <Label>{option.signature}</Label>
                            </span>

                            <span className="mt-2 flex flex-wrap items-start gap-x-5 gap-y-2 sm:flex-nowrap">
                              {/*
                                The drawing does the explaining that prose is bad
                                at: how many rounds, what feeds what, whether
                                anything carries forward.
                              */}
                              <span className="border-rule bg-paper-raised block w-full max-w-64 shrink-0 border px-2 py-1">
                                <ShapeDiagram config={option.config} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="text-ink-2 block max-w-[52ch] text-sm leading-snug">
                                  {option.summary}
                                </span>
                                {/* How much of everyone's day this costs. */}
                                <span className="text-ink-3 mt-1.5 block text-xs">
                                  Matches each: {option.games}
                                </span>
                              </span>
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section label="Or start from a sport" meta={`${SPORTS.length} sports`}>
          <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
            None of these is a mode. Each format is a shape from above with the scoring and
            tiebreaks already filled in, because typing a points system in from memory is a chore.
            Every one says which shape it is, and every setting is editable afterwards.
          </p>

          <div className="space-y-6">
            {SPORTS.map((sport) => (
              <div key={sport.id}>
                <h3 className="sheet-label text-ink">{sport.name}</h3>
                {/* The rules that hold across every way of running it. */}
                <p className="text-ink-2 mt-1 max-w-[68ch] text-sm leading-snug">{sport.note}</p>

                <div className="mt-2 grid gap-x-6 sm:grid-cols-2">
                  {sport.formats.map((format) => {
                    const selected = choice.from === "sport" && format.id === choice.id;
                    return (
                      <label
                        key={format.id}
                        className={`border-rule flex cursor-pointer items-start gap-3 border-b py-2.5 transition-colors ${
                          selected ? "bg-paper-sunk" : "hover:bg-paper-sunk"
                        } has-focus-visible:outline-focus has-focus-visible:outline-2 has-focus-visible:outline-offset-2`}
                      >
                        <input
                          type="radio"
                          name="example"
                          value={format.id}
                          checked={selected}
                          onChange={() => setChoice({ from: "sport", id: format.id })}
                          className="sr-only"
                        />
                        <span
                          aria-hidden
                          className={`mt-1.5 inline-block size-2.5 shrink-0 rounded-[1px] ${
                            selected ? "bg-signal" : "border-rule-strong border opacity-40"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-sm ${selected ? "text-ink font-semibold" : "text-ink font-medium"}`}
                          >
                            {format.name}
                          </span>
                          <span className="text-ink-2 mt-0.5 block text-xs leading-snug">
                            {format.fills}
                          </span>
                          <span className="text-ink-3 mt-0.5 block text-xs">
                            Shape: {format.basedOn}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {choice.from === "sport" && chosen ? (
            <div className="border-rule bg-paper-raised mt-5 border px-3 py-2">
              <Label>Structure</Label>
              <ShapeDiagram config={chosen.config} />
            </div>
          ) : null}
        </Section>

        <Section
          label="Entrants"
          meta={entrants.length > 0 ? `${entrants.length} listed` : "One per line"}
        >
          <div className="grid gap-5 py-5 sm:grid-cols-2">
            <Field
              label="Names"
              hint="One per line, strongest first — the order becomes the seeding. You can add more later."
            >
              <textarea
                value={roster}
                onChange={(e) => setRoster(e.target.value)}
                rows={9}
                placeholder={"Marie Dubois\nLuc Martin\nAna Costa\nPaul Rossi"}
                className={`${inputClass} resize-y font-mono text-sm leading-relaxed`}
              />
            </Field>

            {/*
              Reading back what was typed, seeded, is worth the space: a stray
              blank line or a duplicated name is obvious here and invisible in
              the textarea.
            */}
            <div>
              <Label>Draw order</Label>
              {entrants.length === 0 ? (
                <p className="text-ink-3 mt-2 text-sm">Nobody yet.</p>
              ) : (
                <ol className="mt-1.5 max-h-64 overflow-y-auto">
                  {entrants.map((entrantName, i) => (
                    <li
                      key={`${entrantName}-${i}`}
                      className="border-rule flex items-baseline gap-3 border-b py-1.5"
                    >
                      <span className="tnum text-ink-3 w-6 shrink-0 text-right font-mono text-xs">
                        {i + 1}
                      </span>
                      <span className="text-ink-2 min-w-0 flex-1 truncate text-sm">
                        {entrantName}
                      </span>
                      {duplicates.has(entrantName) ? (
                        <span className="text-signal-ink text-xs">repeated</span>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </Section>

        {error ? <Notice tone="warn">{error}</Notice> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" className="min-h-11 px-5">
            Create
          </Button>
          <Button variant="quiet" onClick={() => navigate("/")}>
            Cancel
          </Button>
          <span className="text-ink-3 text-xs">
            {entrants.length === 0
              ? "You can add entrants on the next screen."
              : `${entrants.length} entrant${entrants.length === 1 ? "" : "s"} ready.`}
          </span>
        </div>
      </form>
    </div>
  );
}
