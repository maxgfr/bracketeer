/**
 * The table.
 *
 * Every configured tiebreaker gets its own column, in the order it is applied,
 * with the column head naming what it measures. That is deliberate: a table that
 * shows only the final order asks people to trust it, while a table that shows
 * Buchholz next to the record explains why the competitor with three narrow
 * losses to the top seeds is placed above the one who beat the bottom of the
 * field.
 */

import type { StandingRow, TournamentState } from "@bracketeer/engine";
import { round, signed, TIEBREAKER_LABELS, TIEBREAKER_TITLES } from "../lib/format.js";

interface Props {
  state: TournamentState;
  rows: StandingRow[];
  /** Highlight the entrants who advance to the next stage. */
  qualifyingCount?: number | null;
}

export function StandingsTable({ state, rows, qualifyingCount = null }: Props) {
  if (rows.length === 0) return null;

  const tiebreakers = state.config.standings.tiebreakers;
  const showRating = state.config.rating.system !== "none";

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="border-rule-strong border-b">
            <th scope="col" className="sheet-label text-ink-3 w-8 py-1.5 text-right font-normal">
              #
            </th>
            <th scope="col" className="sheet-label text-ink-3 py-1.5 pl-3 text-left font-normal">
              Entrant
            </th>
            <th scope="col" className="sheet-label text-ink-3 w-14 py-1.5 text-right font-normal" title="Played">
              PL
            </th>
            <th scope="col" className="sheet-label text-ink-3 w-20 py-1.5 text-right font-normal" title="Won / drawn / lost">
              W-D-L
            </th>
            {tiebreakers.map((tiebreaker) => (
              <th
                key={tiebreaker.key}
                scope="col"
                title={TIEBREAKER_TITLES[tiebreaker.key] ?? tiebreaker.key}
                className="sheet-label text-ink-3 w-14 py-1.5 text-right font-normal"
              >
                {TIEBREAKER_LABELS[tiebreaker.key] ?? tiebreaker.key}
              </th>
            ))}
            {showRating ? (
              <th scope="col" className="sheet-label text-ink-3 w-20 py-1.5 text-right font-normal" title="Rating">
                RTG
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const entrant = state.entrants.find((e) => e.id === row.entrantId);
            const qualifies = qualifyingCount !== null && row.rank <= qualifyingCount;

            return (
              <tr
                key={row.entrantId}
                className={`border-rule border-b ${entrant?.status === "withdrawn" ? "opacity-45" : ""}`}
              >
                <td className="tnum text-ink-2 py-2 text-right font-mono">
                  {/* A shared rank is stated once and left blank below it, as a printed table does. */}
                  {row.tiedWithNext || rows.find((r) => r.rank === row.rank) === row ? row.rank : ""}
                </td>
                <td className="py-2 pl-3">
                  <div className="flex items-center gap-2">
                    {qualifies ? (
                      <span aria-hidden className="bg-signal inline-block size-1.5 rounded-full" />
                    ) : null}
                    <span className="text-ink truncate font-medium">{entrant?.name ?? row.entrantId}</span>
                    {entrant?.meta.club ? (
                      <span className="text-ink-3 truncate text-xs">{entrant.meta.club}</span>
                    ) : null}
                  </div>
                </td>
                <td className="tnum text-ink-2 py-2 text-right font-mono">
                  {row.record.played}
                  {row.record.byes > 0 ? <span className="text-ink-3">+{row.record.byes}</span> : null}
                </td>
                <td className="tnum text-ink-2 py-2 text-right font-mono">
                  {row.record.wins}-{row.record.draws}-{row.record.losses}
                </td>
                {tiebreakers.map((tiebreaker) => (
                  <td
                    key={tiebreaker.key}
                    className={`tnum py-2 text-right font-mono ${
                      tiebreaker.key === "points" ? "text-ink font-semibold" : "text-ink-2"
                    }`}
                  >
                    {formatMetric(tiebreaker.key, row.metrics[tiebreaker.key] ?? 0)}
                  </td>
                ))}
                {showRating ? (
                  <td className="tnum text-ink-2 py-2 text-right font-mono">
                    {round(row.metrics.rating ?? 0)}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatMetric(key: string, value: number): string {
  if (key === "point_diff") return signed(value, 1).replace(/\.0$/, "");
  if (key === "drawn_lot") return "";
  if (key === "rating" || key === "opponent_avg_rating") return round(value);
  return round(value, 1).replace(/\.0$/, "");
}
