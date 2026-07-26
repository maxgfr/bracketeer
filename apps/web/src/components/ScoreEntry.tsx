/**
 * Entering a result.
 *
 * This is the thing the app exists to do, and it is done standing up, one-handed,
 * often in the sun. So the score fields *are* the interface: no dialog to open,
 * no button to hunt for. Type two numbers, press enter, the round moves on.
 *
 * The shape of the form follows the configured score kind, which is why one
 * component serves pétanque, tennis, a race and a chess game without knowing
 * what any of them are.
 */

import type { Match, MatchResult, ScoreConfig, TournamentState } from "@bracketeer/engine";
import { useEffect, useRef, useState } from "react";
import { entrantName } from "../lib/format.js";
import { Button, inputClass, Label } from "./Sheet.js";

interface Props {
  state: TournamentState;
  match: Match;
  onSubmit: (result: MatchResult) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}

export function ScoreEntry({ state, match, onSubmit, onCancel, autoFocus = true }: Props) {
  const score = state.config.score;
  const sides = match.sides.map((side) => entrantName(state, side.entrantId));

  switch (score.kind) {
    case "points":
      return <PointsEntry sides={sides} score={score} onSubmit={onSubmit} onCancel={onCancel} autoFocus={autoFocus} />;
    case "sets":
      return <SetsEntry sides={sides} score={score} onSubmit={onSubmit} onCancel={onCancel} autoFocus={autoFocus} />;
    case "outcome":
      return <OutcomeEntry sides={sides} score={score} onSubmit={onSubmit} onCancel={onCancel} />;
    case "placement":
      return <PlacementEntry sides={sides} onSubmit={onSubmit} onCancel={onCancel} />;
    case "time":
      return <TimeEntry sides={sides} onSubmit={onSubmit} onCancel={onCancel} autoFocus={autoFocus} />;
  }
}

function Actions({ onCancel, submitLabel = "Record" }: { onCancel?: () => void; submitLabel?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" variant="primary">
        {submitLabel}
      </Button>
      {onCancel ? (
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}

function PointsEntry({
  sides,
  score,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  sides: string[];
  score: Extract<ScoreConfig, { kind: "points" }>;
  onSubmit: (r: MatchResult) => void;
  onCancel?: () => void;
  autoFocus: boolean;
}) {
  const [values, setValues] = useState<string[]>(() => sides.map(() => ""));
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) first.current?.focus();
  }, [autoFocus]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const scores = values.map((v) => Number(v));

    if (values.some((v) => v.trim() === "") || scores.some((n) => !Number.isFinite(n))) {
      setError("Enter a score for each side.");
      return;
    }
    if (scores.some((n) => n < 0)) {
      setError("Scores cannot be negative.");
      return;
    }
    if (score.integerOnly && scores.some((n) => !Number.isInteger(n))) {
      setError("Scores must be whole numbers.");
      return;
    }
    const ceiling = score.cap ?? score.target;
    if (ceiling !== null && scores.some((n) => n > ceiling)) {
      setError(`This tournament plays to ${ceiling}.`);
      return;
    }
    if (!score.allowDraw && new Set(scores).size === 1) {
      setError("This tournament does not allow draws.");
      return;
    }

    onSubmit({ kind: "points", scores });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-2">
        {sides.map((name, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-ink min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
            <input
              ref={i === 0 ? first : undefined}
              value={values[i] ?? ""}
              onChange={(e) => {
                setError(null);
                setValues((v) => v.map((old, j) => (i === j ? e.target.value : old)));
              }}
              inputMode="numeric"
              // A dedicated numeric keypad matters more than the field looking tidy.
              pattern="[0-9]*"
              aria-label={`Score for ${name}`}
              className={`${inputClass} tnum w-20 shrink-0 text-center font-mono text-lg`}
              placeholder={score.target ? String(score.target) : "0"}
            />
          </div>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-signal-ink text-sm">
          {error}
        </p>
      ) : null}
      <Actions onCancel={onCancel} />
    </form>
  );
}

function SetsEntry({
  sides,
  score,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  sides: string[];
  score: Extract<ScoreConfig, { kind: "sets" }>;
  onSubmit: (r: MatchResult) => void;
  onCancel?: () => void;
  autoFocus: boolean;
}) {
  const maxSets = score.bestOf;
  const [sets, setSets] = useState<string[][]>(() =>
    Array.from({ length: maxSets }, () => sides.map(() => "")),
  );
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) first.current?.focus();
  }, [autoFocus]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // A best-of-five that ends in three is normal; drop the sets nobody played.
    const played = sets.filter((set) => set.some((v) => v.trim() !== ""));
    if (played.length === 0) {
      setError("Enter at least one set.");
      return;
    }
    if (played.some((set) => set.some((v) => v.trim() === "" || !Number.isFinite(Number(v))))) {
      setError("Fill in both scores for every set you played.");
      return;
    }
    onSubmit({ kind: "sets", sets: played.map((set) => set.map(Number)) });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="min-w-28 shrink-0 space-y-2 pt-6">
          {sides.map((name, i) => (
            <div key={i} className="flex h-10 items-center text-sm font-medium">
              <span className="truncate">{name}</span>
            </div>
          ))}
        </div>
        {sets.map((set, s) => (
          <div key={s} className="shrink-0 space-y-2">
            <Label className="block text-center">{s + 1}</Label>
            {set.map((value, i) => (
              <input
                key={i}
                ref={s === 0 && i === 0 ? first : undefined}
                value={value}
                onChange={(e) => {
                  setError(null);
                  setSets((current) =>
                    current.map((row, rs) =>
                      rs === s ? row.map((old, ri) => (ri === i ? e.target.value : old)) : row,
                    ),
                  );
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                aria-label={`Set ${s + 1}, ${sides[i]}`}
                className={`${inputClass} tnum w-14 text-center font-mono`}
              />
            ))}
          </div>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-signal-ink text-sm">
          {error}
        </p>
      ) : null}
      <Actions onCancel={onCancel} />
    </form>
  );
}

function OutcomeEntry({
  sides,
  score,
  onSubmit,
  onCancel,
}: {
  sides: string[];
  score: Extract<ScoreConfig, { kind: "outcome" }>;
  onSubmit: (r: MatchResult) => void;
  onCancel?: () => void;
}) {
  return (
    <div className="space-y-2">
      {sides.map((name, i) => (
        <Button key={i} className="w-full justify-start" onClick={() => onSubmit({ kind: "outcome", winner: i })}>
          {name} wins
        </Button>
      ))}
      {score.allowDraw ? (
        <Button className="w-full justify-start" onClick={() => onSubmit({ kind: "outcome", winner: null })}>
          Draw
        </Button>
      ) : null}
      {onCancel ? (
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A finishing order. Tapping the names in the order they finished is faster and
 * less error-prone than typing positions, especially one-handed.
 */
function PlacementEntry({
  sides,
  onSubmit,
  onCancel,
}: {
  sides: string[];
  onSubmit: (r: MatchResult) => void;
  onCancel?: () => void;
}) {
  const [order, setOrder] = useState<number[]>([]);
  const remaining = sides.map((_, i) => i).filter((i) => !order.includes(i));

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {order.map((sideIndex, position) => (
          <div key={sideIndex} className="border-rule flex items-center gap-3 border-b pb-1.5">
            <span className="tnum text-signal w-6 font-mono text-lg font-semibold">{position + 1}</span>
            <span className="flex-1 truncate text-sm font-medium">{sides[sideIndex]}</span>
            <Button variant="quiet" onClick={() => setOrder((o) => o.filter((i) => i !== sideIndex))}>
              Undo
            </Button>
          </div>
        ))}
      </div>

      {remaining.length > 0 ? (
        <div className="space-y-1.5">
          <Label>Tap in finishing order</Label>
          {remaining.map((sideIndex) => (
            <Button
              key={sideIndex}
              className="w-full justify-start"
              onClick={() => setOrder((o) => [...o, sideIndex])}
            >
              {sides[sideIndex]}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          disabled={remaining.length > 0}
          onClick={() => onSubmit({ kind: "placement", places: order.map((i) => [i]) })}
        >
          Record
        </Button>
        {onCancel ? (
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function TimeEntry({
  sides,
  onSubmit,
  onCancel,
  autoFocus,
}: {
  sides: string[];
  onSubmit: (r: MatchResult) => void;
  onCancel?: () => void;
  autoFocus: boolean;
}) {
  const [values, setValues] = useState<string[]>(() => sides.map(() => ""));
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) first.current?.focus();
  }, [autoFocus]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // A blank is meaningful here: it records somebody who did not finish.
    const times = values.map((v) => (v.trim() === "" ? null : Number(v)));
    if (times.every((t) => t === null)) {
      setError("Enter a time for at least one competitor.");
      return;
    }
    if (times.some((t) => t !== null && (!Number.isFinite(t) || t < 0))) {
      setError("Times must be positive numbers.");
      return;
    }
    onSubmit({ kind: "time", times });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-2">
        {sides.map((name, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-ink min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
            <input
              ref={i === 0 ? first : undefined}
              value={values[i] ?? ""}
              onChange={(e) => {
                setError(null);
                setValues((v) => v.map((old, j) => (i === j ? e.target.value : old)));
              }}
              inputMode="decimal"
              aria-label={`Time for ${name}`}
              placeholder="DNF"
              className={`${inputClass} tnum w-24 shrink-0 text-center font-mono`}
            />
          </div>
        ))}
      </div>
      <p className="text-ink-3 text-xs">Leave a time blank to record a competitor who did not finish.</p>
      {error ? (
        <p role="alert" className="text-signal-ink text-sm">
          {error}
        </p>
      ) : null}
      <Actions onCancel={onCancel} />
    </form>
  );
}
