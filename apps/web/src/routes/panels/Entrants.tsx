/**
 * The entry list.
 *
 * Someone always turns up late and someone always drops out, usually after the
 * draw is made. Withdrawing keeps an entrant's played results intact and simply
 * stops them being paired again — deleting them would rewrite history.
 */

import { addEntrant } from "@bracketeer/engine";
import { useState } from "react";
import {
  Button,
  Empty,
  Field,
  Figure,
  inlineInputClass,
  inputClass,
  Label,
  Notice,
  NumberInput,
  Section,
} from "../../components/Sheet.js";
import { randomId } from "../../lib/storage.js";
import type { Store } from "../Tournament.js";

export function EntrantsPanel({ store }: { store: Store }) {
  const { state, dispatch, ratings } = store;
  const [names, setNames] = useState("");
  const fields = state.config.entrantFields;
  const drawn = state.matches.length > 0;

  const add = () => {
    const lines = names
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const highestSeed = state.entrants.reduce((max, e) => Math.max(max, e.seed ?? 0), 0);
    dispatch(
      lines.map((name, i) =>
        addEntrant({ id: randomId(6), name, seed: highestSeed + i + 1 }),
      ),
    );
    setNames("");
  };

  return (
    <div className="space-y-12">
      <Section label="Entrants" meta={`${state.entrants.filter((e) => e.status === "active").length} active`}>
        {state.entrants.length === 0 ? (
          <Empty title="Nobody has entered yet">Add names below and they will be seeded in the order you list them.</Empty>
        ) : (
          <ul>
            {state.entrants.map((entrant) => (
              <li
                key={entrant.id}
                className={`border-rule flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-2.5 ${
                  entrant.status === "withdrawn" ? "opacity-55" : ""
                }`}
              >
                <label className="shrink-0">
                  <span className="sr-only">Seed for {entrant.name}</span>
                  <NumberInput
                    value={entrant.seed ?? ""}
                    placeholder="—"
                    onChange={(e) =>
                      dispatch({
                        type: "entrant_updated",
                        id: entrant.id,
                        patch: {
                          seed: e.target.value === "" ? null : Number(e.target.value),
                        },
                      })
                    }
                    className="w-14 min-h-9 text-center"
                  />
                </label>

                <label className="min-w-40 flex-1">
                  <span className="sr-only">Name of entrant {entrant.seed ?? ""}</span>
                  <input
                    value={entrant.name}
                    onChange={(e) =>
                      dispatch({
                        type: "entrant_updated",
                        id: entrant.id,
                        patch: { name: e.target.value },
                      })
                    }
                    className={`${inlineInputClass} w-full font-medium`}
                  />
                </label>

                {fields.map((field) => (
                  <label key={field.key} className="shrink-0">
                    <span className="sr-only">
                      {field.label} for {entrant.name}
                    </span>
                    <input
                      value={entrant.meta[field.key] ?? ""}
                      placeholder={field.label}
                      onChange={(e) =>
                        dispatch({
                          type: "entrant_updated",
                          id: entrant.id,
                          patch: { meta: { ...entrant.meta, [field.key]: e.target.value } },
                        })
                      }
                      className={`${inlineInputClass} w-28`}
                    />
                  </label>
                ))}

                {state.config.rating.system !== "none" ? (
                  <Figure
                    className="w-14 shrink-0 text-right text-xs"
                    title={`Current rating for ${entrant.name}`}
                  >
                    {Math.round(ratings.get(entrant.id) ?? state.config.rating.initial)}
                  </Figure>
                ) : null}

                {entrant.status === "withdrawn" ? (
                  <Label className="text-signal-ink">Withdrawn</Label>
                ) : null}

                <Button
                  variant="quiet"
                  title={
                    entrant.status === "active"
                      ? `Withdraw ${entrant.name} — played results are kept`
                      : `Bring ${entrant.name} back in`
                  }
                  onClick={() =>
                    dispatch({
                      type: "entrant_status_changed",
                      id: entrant.id,
                      status: entrant.status === "active" ? "withdrawn" : "active",
                    })
                  }
                >
                  {entrant.status === "active" ? "Withdraw" : "Reinstate"}
                </Button>

                {!drawn ? (
                  <Button
                    variant="quiet"
                    title={`Remove ${entrant.name} from the list`}
                    onClick={() => dispatch({ type: "entrant_removed", id: entrant.id })}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section label="Add entrants">
        <div className="py-5">
          <Field label="Names" hint="One per line. They are seeded in the order you list them.">
            <textarea
              value={names}
              onChange={(e) => setNames(e.target.value)}
              rows={5}
              className={`${inputClass} resize-y font-mono text-sm`}
              placeholder={"Marie Dubois\nLuc Martin"}
            />
          </Field>
          <div className="mt-3">
            <Button variant="primary" onClick={add}>
              Add
            </Button>
          </div>
        </div>
        {drawn ? (
          <Notice>
            The draw has already been made. Anyone you add now will only be included when the next
            stage starts, or the next round is paired.
          </Notice>
        ) : null}
      </Section>

      <Section label="Custom fields" meta="Club, country, category…">
        <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
          Fields you add here appear against every entrant, show in the table, and can be used to
          keep people apart in the draw — pairing has a constraint that avoids matching entrants who
          share a value. Mark one private and it is left out of anything you share publicly: a
          phone number or a licence number is not in the watch link at all, rather than hidden
          inside it.
        </p>
        <ul>
          {fields.map((field) => (
            <li key={field.key} className="border-rule flex flex-wrap items-center gap-3 border-b py-2">
              <Label>{field.key}</Label>
              <span className="text-ink-2 min-w-24 flex-1 text-sm">{field.label}</span>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={field.private === true}
                  onChange={(e) =>
                    dispatch({
                      type: "config_replaced",
                      config: {
                        ...state.config,
                        entrantFields: fields.map((f) =>
                          f.key === field.key ? { ...f, private: e.target.checked } : f,
                        ),
                      },
                    })
                  }
                  className="border-rule-strong accent-signal size-4"
                />
                <Label>Private</Label>
              </label>
              <Button
                variant="quiet"
                onClick={() =>
                  dispatch({
                    type: "config_replaced",
                    config: {
                      ...state.config,
                      entrantFields: fields.filter((f) => f.key !== field.key),
                    },
                  })
                }
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <AddField store={store} />
      </Section>
    </div>
  );
}

function AddField({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const [label, setLabel] = useState("");

  const key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  return (
    <div className="flex flex-wrap items-end gap-3 pt-4">
      <Field label="New field" className="min-w-48 flex-1">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Club"
          className={inputClass}
        />
      </Field>
      <Button
        disabled={key === "" || state.config.entrantFields.some((f) => f.key === key)}
        onClick={() => {
          dispatch({
            type: "config_replaced",
            config: {
              ...state.config,
              entrantFields: [...state.config.entrantFields, { key, label: label.trim() }],
            },
          });
          setLabel("");
        }}
      >
        Add field
      </Button>
    </div>
  );
}
