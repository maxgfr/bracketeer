/**
 * The draw.
 *
 * Brackets get the connector-line treatment; Swiss and league stages have no
 * tree to draw, so they get what they actually are — a round-by-round list of
 * fixtures.
 */

import type { BracketSlot, Match } from "@bracketeer/engine";
import { useEffect, useRef, useState } from "react";
import { Bracket } from "../../components/Bracket.js";
import { ScoreEntry } from "../../components/ScoreEntry.js";
import { Button, Empty, Figure, Label, Marker, Section } from "../../components/Sheet.js";
import { entrantName, scoreline, STAGE_LABELS, winningSideIndex } from "../../lib/format.js";
import type { Store } from "../Tournament.js";

const BRACKET_ORDER: BracketSlot[] = ["main", "lower", "consolation", "grand_final", "third_place"];

export function DrawPanel({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const [editing, setEditing] = useState<Match | null>(null);

  if (state.matches.length === 0) {
    return <Empty title="The draw has not been made">Start the tournament to draw the first round.</Empty>;
  }

  return (
    <div className="space-y-12">
      {state.stages.map((runtime) => {
        const config = state.config.stages.find((s) => s.id === runtime.id);
        const matches = state.matches.filter((m) => m.stageId === runtime.id);
        const isTree =
          config?.kind === "single_elimination" || config?.kind === "double_elimination";

        return (
          <Section
            key={runtime.id}
            label={config?.name || STAGE_LABELS[config?.kind ?? ""] || runtime.id}
            meta={`${matches.length} fixtures`}
          >
            {runtime.groups.length > 0 ? (
              <div className="space-y-8 pt-5">
                {runtime.groups.map((group) => (
                  <div key={group.id}>
                    <Label>{group.name}</Label>
                    <RoundList
                      store={store}
                      matches={matches.filter((m) => m.groupId === group.id)}
                      onEdit={setEditing}
                    />
                  </div>
                ))}
              </div>
            ) : isTree ? (
              <div className="space-y-8 pt-5">
                {BRACKET_ORDER.map((bracket) => (
                  <Bracket
                    key={bracket}
                    state={state}
                    matches={matches}
                    bracket={bracket}
                    selectedId={editing?.id ?? null}
                    onSelect={setEditing}
                  />
                ))}
              </div>
            ) : (
              <RoundList store={store} matches={matches} onEdit={setEditing} />
            )}
          </Section>
        );
      })}

      {editing ? (
        <ScoreSheet
          label={editing.label ?? "Fixture"}
          onDismiss={() => setEditing(null)}
        >
          <ScoreEntry
            state={state}
            match={editing}
            onSubmit={(result) => {
              dispatch({ type: "result_reported", matchId: editing.id, result });
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        </ScoreSheet>
      ) : null}
    </div>
  );
}

/**
 * Score entry raised over the draw.
 *
 * A bracket is a two-dimensional canvas — expanding a fixture in place would
 * shove every other fixture sideways and lose the reader's position. So this
 * one case earns a raised sheet, and pays the price properly: Escape dismisses
 * it, the backdrop is clickable, focus moves in and returns to where it came
 * from, and the page behind stops scrolling.
 */
function ScoreSheet({
  label,
  onDismiss,
  children,
}: {
  label: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<Element | null>(null);

  useEffect(() => {
    returnFocusTo.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (returnFocusTo.current as HTMLElement | null)?.focus?.();
    };
  }, [onDismiss]);

  return (
    <div className="no-print fixed inset-0 z-20 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close score entry"
        onClick={onDismiss}
        className="absolute inset-0 bg-black/25"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Score for ${label}`}
        className="border-rule-strong bg-paper-raised relative w-full max-w-lg border-t-2 p-5 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.3)]"
      >
        <div className="flex items-baseline justify-between gap-4">
          <Label>{label}</Label>
          <Button variant="quiet" onClick={onDismiss} title="Close (Esc)">
            Close
          </Button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function RoundList({
  store,
  matches,
  onEdit,
}: {
  store: Store;
  matches: Match[];
  onEdit: (match: Match) => void;
}) {
  const { state } = store;
  const rounds = [...new Set(matches.map((m) => m.roundIndex))].sort((a, b) => a - b);

  return (
    <div className="space-y-6 pt-4">
      {rounds.map((roundIndex) => {
        const inRound = matches
          .filter((m) => m.roundIndex === roundIndex)
          .sort((a, b) => a.order - b.order);

        return (
          <div key={roundIndex} className="print-break-inside-avoid">
            <Label>Round {roundIndex + 1}</Label>
            <ul className="mt-1.5">
              {inRound.map((match) => {
                const winner = winningSideIndex(match, state.config.score);
                const parts = scoreline(match.result, state.config.score).split("–");
                const clickable = match.status === "ready" || match.status === "complete";

                const content = (
                  <div className="flex items-center gap-3 py-2">
                    <Marker
                      state={
                        match.status === "ready"
                          ? "live"
                          : match.status === "complete" || match.status === "bye"
                            ? "done"
                            : "waiting"
                      }
                    />
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
                            {match.status === "bye"
                              ? side.entrantId
                                ? "bye"
                                : ""
                              : (parts[i] ?? "")}
                          </Figure>
                        </div>
                      ))}
                    </div>
                  </div>
                );

                return (
                  <li key={match.id} className="border-rule border-b">
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => onEdit(match)}
                        className="hover:bg-paper-sunk block w-full text-left transition-colors"
                      >
                        {content}
                      </button>
                    ) : (
                      content
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
