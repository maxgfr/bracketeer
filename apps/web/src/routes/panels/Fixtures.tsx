/**
 * The fixtures.
 *
 * The first thing on the page is what needs a score, at the largest type in the
 * interface, with the entry fields opening in place. Everything already played
 * sits below in a quieter register — present for checking, not competing for
 * attention with the fixture somebody is standing next to.
 */

import type { Match } from "@bracketeer/engine";
import { useState } from "react";
import { ScoreEntry } from "../../components/ScoreEntry.js";
import { Button, Empty, Figure, Label, Marker, Section } from "../../components/Sheet.js";
import { entrantName, formatTime, scoreline, winningSideIndex } from "../../lib/format.js";
import type { Store } from "../Tournament.js";

export function FixturesPanel({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const [editing, setEditing] = useState<string | null>(null);
  const [justRecorded, setJustRecorded] = useState<string | null>(null);

  const ready = state.matches.filter((m) => m.status === "ready");
  const played = state.matches
    .filter((m) => m.status === "complete" || m.status === "bye")
    .slice()
    .reverse();
  const waiting = state.matches.filter((m) => m.status === "pending");

  if (state.matches.length === 0) {
    return (
      <Empty title="No fixtures yet">
        Add your entrants, then start the tournament to draw the first round.
      </Empty>
    );
  }

  const record = (match: Match) => (
    <ScoreEntry
      state={state}
      match={match}
      onSubmit={(result) => {
        dispatch({ type: "result_reported", matchId: match.id, result });
        setEditing(null);
        setJustRecorded(match.id);
      }}
      onCancel={() => setEditing(null)}
    />
  );

  return (
    <div className="space-y-12">
      <Section
        label="To be played"
        meta={ready.length > 0 ? `${ready.length} awaiting a score` : undefined}
      >
        {ready.length === 0 ? (
          <Empty title="Nothing to score right now">
            Either every fixture is done, or the next round is waiting to be drawn.
          </Empty>
        ) : (
          <ul>
            {ready.map((match) => (
              <li key={match.id} className="border-rule border-b py-4">
                <div className="flex items-baseline gap-2">
                  <Marker state="live" />
                  <Label>{match.label ?? "Fixture"}</Label>
                  {match.scheduledAt ? (
                    <Figure className="text-xs">{formatTime(match.scheduledAt)}</Figure>
                  ) : null}
                  {match.venueId ? (
                    <span className="text-ink-3 text-xs">
                      {state.config.schedule.venues.find((v) => v.id === match.venueId)?.name ??
                        match.venueId}
                    </span>
                  ) : null}
                </div>

                {editing === match.id ? (
                  <div className="mt-3 pl-4">{record(match)}</div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(match.id)}
                    className="mt-1.5 block w-full pl-4 text-left"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      {match.sides.map((side, i) => (
                        <span key={i} className="text-ink text-xl leading-tight font-medium sm:text-2xl">
                          {entrantName(state, side.entrantId)}
                          {i < match.sides.length - 1 ? (
                            <span className="text-ink-3 px-2 font-normal">v</span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                    <span className="text-signal-ink sheet-label mt-1.5 inline-block">
                      Enter the score
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {played.length > 0 ? (
        <Section label="Results" meta={`${played.length} played`}>
          <ul>
            {played.map((match) => {
              const winner = winningSideIndex(match, state.config.score);
              const parts = scoreline(match.result, state.config.score).split("–");

              return (
                <li
                  key={match.id}
                  className={`border-rule border-b ${justRecorded === match.id ? "settle" : ""}`}
                >
                  {editing === match.id ? (
                    <div className="py-4">
                      <Label>Correcting {match.label ?? "fixture"}</Label>
                      <div className="mt-3">{record(match)}</div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 py-2.5">
                      <Marker state="done" />
                      <div className="min-w-0 flex-1">
                        {match.sides.map((side, i) => (
                          <div key={i} className="flex items-baseline gap-3">
                            <span
                              className={`min-w-0 flex-1 truncate text-sm ${
                                winner === i ? "text-ink font-semibold" : "text-ink-2"
                              }`}
                            >
                              {entrantName(state, side.entrantId)}
                            </span>
                            <Figure emphasis={winner === i}>
                              {match.status === "bye" ? (side.entrantId ? "bye" : "") : (parts[i] ?? "")}
                            </Figure>
                          </div>
                        ))}
                      </div>
                      {match.status !== "bye" ? (
                        <Button
                          variant="quiet"
                          className="no-print"
                          onClick={() => setEditing(match.id)}
                          title="Correct this result"
                        >
                          Edit
                        </Button>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {waiting.length > 0 ? (
        <Section label="Still to come" meta={`${waiting.length} waiting on earlier fixtures`}>
          <ul>
            {waiting.slice(0, 12).map((match) => (
              <li key={match.id} className="border-rule flex items-center gap-3 border-b py-2">
                <Marker state="waiting" />
                <span className="text-ink-3 min-w-0 flex-1 truncate text-sm">
                  {match.sides.map((side) => entrantName(state, side.entrantId)).join("  v  ")}
                </span>
                <Label>{match.label ?? ""}</Label>
              </li>
            ))}
          </ul>
          {waiting.length > 12 ? (
            <p className="text-ink-3 py-2 text-xs">
              and {waiting.length - 12} more — the full draw is on the Draw tab.
            </p>
          ) : null}
        </Section>
      ) : null}
    </div>
  );
}
