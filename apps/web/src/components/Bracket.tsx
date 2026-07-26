/**
 * The draw.
 *
 * Laid out as HTML in a scrolling grid rather than as an SVG canvas: fixtures
 * stay selectable, searchable and readable by a screen reader, the browser wraps
 * long names for us, and printing produces a real sheet instead of a bitmap. The
 * connector lines are drawn behind with a single SVG layer, which is the only
 * part that genuinely needs to be geometry.
 */

import type { BracketSlot, Match, TournamentState } from "@bracketeer/engine";
import { useLayoutEffect, useRef, useState } from "react";
import { BRACKET_LABELS, entrantName, scoreline, winningSideIndex } from "../lib/format.js";
import { Figure, Label } from "./Sheet.js";

const COLUMN_WIDTH = 208;
const COLUMN_GAP = 40;

interface Props {
  state: TournamentState;
  matches: Match[];
  bracket: BracketSlot;
  onSelect?: (match: Match) => void;
  selectedId?: string | null;
}

export function Bracket({ state, matches, bracket, onSelect, selectedId }: Props) {
  const inBracket = matches.filter((m) => m.bracket === bracket);
  if (inBracket.length === 0) return null;

  const rounds = [...new Set(inBracket.map((m) => m.roundIndex))].sort((a, b) => a - b);
  const columns = rounds.map((roundIndex) =>
    inBracket.filter((m) => m.roundIndex === roundIndex).sort((a, b) => a.order - b.order),
  );

  return (
    <div className="space-y-2">
      <Label>{BRACKET_LABELS[bracket] ?? bracket}</Label>
      <BracketGrid
        state={state}
        columns={columns}
        onSelect={onSelect}
        selectedId={selectedId}
      />
    </div>
  );
}

function BracketGrid({
  state,
  columns,
  onSelect,
  selectedId,
}: {
  state: TournamentState;
  columns: Match[][];
  onSelect?: (match: Match) => void;
  selectedId?: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ d: string; key: string }[]>([]);

  /**
   * Measure where the fixtures actually landed and draw the connectors to match.
   * Deriving the geometry from the real layout rather than from assumed row
   * heights is what lets a long team name wrap without the lines drifting off.
   */
  useLayoutEffect(() => {
    const root = container.current;
    if (!root) return;

    const draw = () => {
      const rootBox = root.getBoundingClientRect();
      const next: { d: string; key: string }[] = [];

      for (const match of columns.flat()) {
        const target = root.querySelector<HTMLElement>(`[data-match="${CSS.escape(match.id)}"]`);
        if (!target) continue;

        for (const side of match.sides) {
          const source = side.source;
          if (!source || source.from === "qualifier") continue;

          const feeder = root.querySelector<HTMLElement>(`[data-match="${CSS.escape(source.matchId)}"]`);
          if (!feeder) continue;

          const from = feeder.getBoundingClientRect();
          const to = target.getBoundingClientRect();

          const x1 = from.right - rootBox.left;
          const y1 = from.top + from.height / 2 - rootBox.top;
          const x2 = to.left - rootBox.left;
          const y2 = to.top + to.height / 2 - rootBox.top;
          const mid = x1 + (x2 - x1) / 2;

          next.push({
            key: `${source.matchId}->${match.id}-${source.from}`,
            d: `M ${x1} ${y1} H ${mid} V ${y2} H ${x2}`,
          });
        }
      }

      setLines(next);
    };

    draw();

    const observer = new ResizeObserver(draw);
    observer.observe(root);
    return () => observer.disconnect();
  }, [columns, state.matches]);

  return (
    <div className="overflow-x-auto pb-2">
      <div ref={container} className="relative inline-flex" style={{ gap: COLUMN_GAP }}>
        <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
          {lines.map((line) => (
            <path
              key={line.key}
              d={line.d}
              fill="none"
              stroke="var(--rule)"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          ))}
        </svg>

        {columns.map((column, columnIndex) => (
          <div
            key={columnIndex}
            className="relative flex shrink-0 flex-col justify-around gap-3"
            style={{ width: COLUMN_WIDTH }}
          >
            {column.map((match) => (
              <BracketMatch
                key={match.id}
                state={state}
                match={match}
                onSelect={onSelect}
                selected={selectedId === match.id}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketMatch({
  state,
  match,
  onSelect,
  selected,
}: {
  state: TournamentState;
  match: Match;
  onSelect?: (match: Match) => void;
  selected: boolean;
}) {
  const winner = winningSideIndex(match, state.config.score);
  const line = scoreline(match.result, state.config.score).split("–");
  const interactive = onSelect && (match.status === "ready" || match.status === "complete");

  const body = (
    <div
      data-match={match.id}
      className={`bg-paper-raised relative w-full border ${
        selected
          ? "border-signal"
          : match.status === "ready"
            ? "border-rule-strong"
            : "border-rule"
      }`}
    >
      {match.status === "ready" ? (
        <span aria-hidden className="bg-signal absolute -top-px -left-px h-[calc(100%+2px)] w-[3px]" />
      ) : null}

      {match.sides.map((side, i) => (
        <div
          key={i}
          className={`flex items-center gap-2 px-2.5 py-1.5 ${
            i > 0 ? "border-rule border-t" : ""
          }`}
        >
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              winner === i ? "text-ink font-semibold" : "text-ink-2"
            }`}
          >
            {entrantName(state, side.entrantId)}
          </span>
          <Figure emphasis={winner === i} className="text-sm">
            {match.status === "bye" ? (side.entrantId ? "bye" : "") : (line[i] ?? "")}
          </Figure>
        </div>
      ))}
    </div>
  );

  if (!interactive) return body;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(match)}
      className="block w-full text-left"
      aria-label={`${match.label ?? "Fixture"}: ${match.sides
        .map((s) => entrantName(state, s.entrantId))
        .join(" versus ")}`}
    >
      {body}
    </button>
  );
}
