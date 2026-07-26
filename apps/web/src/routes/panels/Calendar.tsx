/**
 * The calendar.
 *
 * Fixtures get dates and courts here, and leave as an .ics so the schedule lands
 * in whatever calendar people already keep. Conflicts are reported, never
 * blocked: an organiser who double-books a court on purpose knows something the
 * software does not.
 */

import { findConflicts, planSchedule, scheduleEvents, toIcs } from "@bracketeer/engine";
import { useMemo, useState } from "react";
import {
  Button,
  Empty,
  Field,
  Figure,
  inputClass,
  Label,
  Notice,
  Section,
} from "../../components/Sheet.js";
import { entrantName, formatDay, formatTime } from "../../lib/format.js";
import type { Store } from "../Tournament.js";

export function CalendarPanel({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const schedule = state.config.schedule;

  const [startsAt, setStartsAt] = useState(() => toLocalInput(schedule.startsAt));
  const [duration, setDuration] = useState(String(schedule.matchDurationMinutes));
  const [gap, setGap] = useState(String(schedule.breakBetweenRoundsMinutes));
  const [venueText, setVenueText] = useState(() =>
    schedule.venues.map((v) => v.name).join("\n"),
  );

  const conflicts = useMemo(() => findConflicts(state), [state]);

  const dated = state.matches
    .filter((m) => m.scheduledAt)
    .slice()
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

  const byDay = useMemo(() => {
    const days = new Map<string, typeof dated>();
    for (const match of dated) {
      const day = (match.scheduledAt ?? "").slice(0, 10);
      days.set(day, [...(days.get(day) ?? []), match]);
    }
    return [...days.entries()];
  }, [dated]);

  const apply = () => {
    const venues = venueText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((name, i) => ({ id: `v${i + 1}`, name, capacity: 1 }));

    const nextSchedule = {
      ...schedule,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      matchDurationMinutes: Math.max(1, Number(duration) || schedule.matchDurationMinutes),
      breakBetweenRoundsMinutes: Math.max(0, Number(gap) || 0),
      venues,
    };

    const plan = planSchedule(state.matches, nextSchedule);

    dispatch([
      { type: "config_replaced", config: { ...state.config, schedule: nextSchedule } },
      ...scheduleEvents(plan),
    ]);
  };

  const download = () => {
    const blob = new Blob([toIcs(state)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slug(state.name)}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-12">
      <Section label="Timings" meta={state.matches.length === 0 ? "Draw the fixtures first" : undefined}>
        <div className="grid gap-5 py-5 sm:grid-cols-2">
          <Field label="First fixture starts" hint="Leave blank to run the tournament without a clock.">
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Minutes per fixture">
            <input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              inputMode="numeric"
              className={`${inputClass} tnum font-mono`}
            />
          </Field>
          <Field label="Break between rounds" hint="Minutes.">
            <input
              value={gap}
              onChange={(e) => setGap(e.target.value)}
              inputMode="numeric"
              className={`${inputClass} tnum font-mono`}
            />
          </Field>
          <Field
            label="Courts"
            hint="One per line. How many run at once, and what they are called on the sheet."
          >
            <textarea
              value={venueText}
              onChange={(e) => setVenueText(e.target.value)}
              rows={4}
              placeholder={"Piste 1\nPiste 2\nPiste 3"}
              className={`${inputClass} resize-y font-mono text-sm`}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 pb-5">
          <Button variant="primary" onClick={apply} disabled={state.matches.length === 0}>
            Lay out the schedule
          </Button>
          <Button onClick={download} disabled={dated.length === 0}>
            Download .ics
          </Button>
          <Button onClick={() => window.print()} className="no-print">
            Print
          </Button>
        </div>
      </Section>

      {conflicts.length > 0 ? (
        <div className="space-y-2">
          {conflicts.slice(0, 6).map((conflict, i) => (
            <Notice key={i} tone="warn">
              {conflict.message}
            </Notice>
          ))}
        </div>
      ) : null}

      {byDay.length === 0 ? (
        <Empty title="Nothing is scheduled">
          Set a start time and lay out the schedule, and every fixture will be given a slot and a
          court.
        </Empty>
      ) : (
        byDay.map(([day, fixtures]) => (
          <Section key={day} label={formatDay(day)} meta={`${fixtures.length} fixtures`}>
            <ul>
              {fixtures.map((match) => (
                <li key={match.id} className="border-rule flex items-center gap-3 border-b py-2.5">
                  <Figure emphasis className="w-14 shrink-0">
                    {formatTime(match.scheduledAt)}
                  </Figure>
                  <span className="text-ink-2 min-w-0 flex-1 truncate text-sm">
                    {match.sides.map((s) => entrantName(state, s.entrantId)).join("  v  ")}
                  </span>
                  {match.venueId ? (
                    <Label>
                      {state.config.schedule.venues.find((v) => v.id === match.venueId)?.name ??
                        match.venueId}
                    </Label>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ))
      )}
    </div>
  );
}

/** `datetime-local` wants local wall-clock time, not an ISO instant. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "tournament"
  );
}
