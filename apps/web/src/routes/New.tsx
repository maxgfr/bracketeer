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
import { useNavigate } from "react-router-dom";
import { Masthead } from "../components/Masthead.js";
import { Button, Field, inputClass, Label, Notice, Section } from "../components/Sheet.js";
import { EXAMPLES } from "../lib/examples.js";
import { actorId, randomId, randomSeed, saveLog } from "../lib/storage.js";

export function NewTournament() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [exampleId, setExampleId] = useState("petanque-concours");
  const [roster, setRoster] = useState("");
  const [error, setError] = useState<string | null>(null);

  const example = useMemo(() => EXAMPLES.find((e) => e.id === exampleId), [exampleId]);

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
    if (!example) return;

    const title = name.trim() || example.name;

    try {
      // Fail here rather than on the tournament page, where the error would have
      // no obvious cause.
      parseConfig(example.config);
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
        config: example.config,
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
                placeholder={example?.name ?? "Spring open"}
                className={inputClass}
                autoFocus
              />
            </Field>
          </div>
        </Section>

        <Section label="Starting point" meta="Every rule can be changed afterwards">
          <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
            These are not modes. Each one is a set of choices across the same six dials, and the
            config editor will show you exactly which. Pick whichever is closest and adjust.
          </p>
          <div role="radiogroup" aria-label="Starting point">
            {EXAMPLES.map((option) => {
              const selected = option.id === exampleId;
              return (
                <label
                  key={option.id}
                  className={`border-rule flex cursor-pointer items-start gap-3 border-b py-3 transition-colors ${
                    selected ? "bg-paper-sunk" : "hover:bg-paper-sunk"
                  } has-focus-visible:outline-focus has-focus-visible:outline-2 has-focus-visible:outline-offset-2`}
                >
                  {/*
                    The native control is hidden but still focusable, so the row
                    carries the focus ring on its behalf — otherwise keyboard
                    users would be moving through an invisible selection.
                  */}
                  <input
                    type="radio"
                    name="example"
                    value={option.id}
                    checked={selected}
                    onChange={() => setExampleId(option.id)}
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
                      <span className={`text-sm ${selected ? "text-ink font-semibold" : "text-ink font-medium"}`}>
                        {option.name}
                      </span>
                      <Label>{option.signature}</Label>
                    </span>
                    <span className="text-ink-2 mt-1 block max-w-[64ch] text-sm leading-snug">
                      {option.summary}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
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
