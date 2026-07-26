/**
 * The embedded view.
 *
 * Read-only, no navigation, no controls — a club website wants the results, not
 * an application. Everything comes from the link, so an embed keeps working
 * whether or not the organiser's browser is open.
 */

import { overallStandings, replay, stageStandings, type EventLog } from "@bracketeer/engine";
import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { StandingsTable } from "../components/StandingsTable.js";
import { Figure, Label, Section } from "../components/Sheet.js";
import { decode } from "../lib/codec.js";
import { entrantName, scoreline, STAGE_LABELS, winningSideIndex } from "../lib/format.js";
import { loadLog } from "../lib/storage.js";

export function EmbedRoute() {
  const { id = "" } = useParams();
  const location = useLocation();

  const log = useMemo<EventLog>(() => {
    const data = new URLSearchParams(location.search).get("d");
    if (data) {
      try {
        return decode(data);
      } catch {
        return [];
      }
    }
    return loadLog(id) ?? [];
  }, [location.search, id]);

  const state = useMemo(() => replay(log), [log]);

  if (log.length === 0) {
    return (
      <div className="text-ink-2 p-6 text-sm">
        This tournament could not be loaded. The link may be incomplete.
      </div>
    );
  }

  const recent = state.matches
    .filter((m) => m.status === "complete")
    .slice(-8)
    .reverse();
  const upcoming = state.matches.filter((m) => m.status === "ready").slice(0, 6);
  const lastStage = state.stages[state.stages.length - 1];

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-5">
      <header className="border-rule-strong border-b-2 pb-2">
        <h1 className="text-ink text-lg font-semibold tracking-[-0.02em]">{state.name}</h1>
        <p className="text-ink-3 text-xs">
          {state.config.stages.map((s) => STAGE_LABELS[s.kind] ?? s.kind).join(" → ")}
        </p>
      </header>

      {upcoming.length > 0 ? (
        <Section label="Next">
          <ul>
            {upcoming.map((match) => (
              <li key={match.id} className="border-rule border-b py-2 text-sm">
                <span className="text-ink-2">
                  {match.sides.map((s) => entrantName(state, s.entrantId)).join("  v  ")}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {recent.length > 0 ? (
        <Section label="Results">
          <ul>
            {recent.map((match) => {
              const winner = winningSideIndex(match, state.config.score);
              const parts = scoreline(match.result, state.config.score).split("–");
              return (
                <li key={match.id} className="border-rule border-b py-2">
                  {match.sides.map((side, i) => (
                    <div key={i} className="flex items-baseline gap-3">
                      <span
                        className={`min-w-0 flex-1 truncate text-sm ${
                          winner === i ? "text-ink font-semibold" : "text-ink-2"
                        }`}
                      >
                        {entrantName(state, side.entrantId)}
                      </span>
                      <Figure emphasis={winner === i}>{parts[i] ?? ""}</Figure>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      {lastStage ? (
        <Section label="Standings">
          <div className="pt-2">
            <StandingsTable
              state={state}
              rows={
                state.stages.length > 1
                  ? overallStandings(state)
                  : stageStandings(state, lastStage.id)
              }
            />
          </div>
        </Section>
      ) : null}

      <p className="text-ink-3 text-center text-xs">
        <a
          className="hover:text-ink underline underline-offset-2"
          href={`${window.location.origin}${window.location.pathname}`}
          target="_blank"
          rel="noreferrer"
        >
          <Label>Made with Bracketeer</Label>
        </a>
      </p>
    </div>
  );
}
