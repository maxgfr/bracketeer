/**
 * The tables.
 *
 * One per stage, plus one per group where a stage has them, plus the overall
 * table across everything played. The tiebreaker columns are shown rather than
 * hidden, because the order they produce is only trustworthy if you can see the
 * working.
 */

import { groupStandings, overallStandings, stageStandings } from "@bracketeer/engine";
import { StandingsTable } from "../../components/StandingsTable.js";
import { Empty, Label, Section } from "../../components/Sheet.js";
import { STAGE_LABELS, TIEBREAKER_TITLES } from "../../lib/format.js";
import type { Store } from "../Tournament.js";

export function StandingsPanel({ store }: { store: Store }) {
  const { state, ratings } = store;

  if (state.stages.length === 0) {
    return <Empty title="No table yet">Start the tournament and play a fixture or two.</Empty>;
  }

  const tiebreakers = state.config.standings.tiebreakers;

  return (
    <div className="space-y-12">
      {state.stages.map((runtime) => {
        const config = state.config.stages.find((s) => s.id === runtime.id);
        const label = config?.name || STAGE_LABELS[config?.kind ?? ""] || runtime.id;

        if (runtime.groups.length > 0) {
          return (
            <Section key={runtime.id} label={label} meta={`${runtime.groups.length} groups`}>
              <div className="space-y-8 pt-5">
                {runtime.groups.map((group) => (
                  <div key={group.id} className="print-break-inside-avoid">
                    <Label>{group.name}</Label>
                    <div className="mt-1.5">
                      <StandingsTable
                        state={state}
                        rows={groupStandings(state, runtime.id, group.id, { ratings })}
                        qualifyingCount={config?.qualification.perGroup ?? null}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          );
        }

        return (
          <Section key={runtime.id} label={label}>
            <div className="pt-3">
              <StandingsTable
                state={state}
                rows={stageStandings(state, runtime.id, { ratings })}
                qualifyingCount={config?.qualification.count ?? null}
              />
            </div>
          </Section>
        );
      })}

      {state.stages.length > 1 ? (
        <Section label="Overall" meta="Every stage combined">
          <div className="pt-3">
            <StandingsTable state={state} rows={overallStandings(state, { ratings })} />
          </div>
        </Section>
      ) : null}

      <Section label="How ties are broken">
        <ol className="pt-3">
          {tiebreakers.map((tiebreaker, i) => (
            <li key={tiebreaker.key} className="border-rule flex gap-3 border-b py-2 text-sm">
              <span className="tnum text-ink-3 w-5 shrink-0 font-mono">{i + 1}</span>
              <span className="text-ink-2">
                {TIEBREAKER_TITLES[tiebreaker.key] ?? tiebreaker.key}
                {tiebreaker.direction === "asc" ? (
                  <span className="text-ink-3"> — lowest first</span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
        <p className="text-ink-3 mt-3 max-w-[68ch] text-xs leading-relaxed">
          Applied in order, each one only to the entrants still level after the one before it. You
          can reorder them on the Rules tab.
        </p>
      </Section>
    </div>
  );
}
