/**
 * The rules.
 *
 * This is the product. Every axis the engine has is editable here, laid out in
 * the order it is applied, with the raw configuration underneath for anything the
 * guided controls do not reach. Nothing is hidden behind a "sport" — changing the
 * pairing strategy and the tiebreak order is how a pétanque concours becomes a
 * chess Swiss.
 *
 * Edits are validated before they are committed, so an invalid rule set is
 * refused with a reason rather than replayed into a broken tournament.
 */

import {
  safeParseConfig,
  type TournamentConfig,
  type TiebreakerKey,
} from "@bracketeer/engine";
import { useState } from "react";
import {
  Button,
  Field,
  inputClass,
  Label,
  Notice,
  NumberInput,
  Section,
  Select,
} from "../../components/Sheet.js";
import { STAGE_LABELS, TIEBREAKER_TITLES } from "../../lib/format.js";
import type { Store } from "../Tournament.js";

const TIEBREAKER_KEYS: TiebreakerKey[] = [
  "points",
  "wins",
  "head_to_head",
  "buchholz",
  "median_buchholz",
  "sonneborn_berger",
  "point_diff",
  "points_for",
  "points_against",
  "opponent_avg_rating",
  "rating",
  "matches_played",
  "drawn_lot",
];

export function ConfigPanel({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const config = state.config;
  const drawn = state.matches.length > 0;

  const update = (next: TournamentConfig) => {
    dispatch({ type: "config_replaced", config: next });
  };

  return (
    <div className="space-y-12">
      {drawn ? (
        <Notice>
          Fixtures have already been drawn. Changing the scoring or the structure now will be
          applied to how results are read and ranked, but it will not redraw what has been played.
        </Notice>
      ) : null}

      <Section label="Who plays">
        <div className="grid gap-5 py-5 sm:grid-cols-2">
          <Field label="Entrant" hint="What one competitor in this tournament is.">
            <Select
              value={config.entrant.kind}
              onChange={(e) =>
                update({
                  ...config,
                  entrant:
                    e.target.value === "drawn_team"
                      ? { kind: "drawn_team", teamSize: 2, redrawEachRound: true }
                      : e.target.value === "fixed_team"
                        ? { kind: "fixed_team", teamSize: null }
                        : { kind: "individual" },
                })
              }
            >
              <option value="individual">One person</option>
              <option value="fixed_team">A team, fixed for the tournament</option>
              <option value="drawn_team">Partners redrawn each round</option>
            </Select>
          </Field>

          <Field label="Sides per fixture" hint="Two is head-to-head. Three or more is a free-for-all.">
            <NumberInput
              value={config.match.sidesPerMatch}
              onChange={(e) =>
                update({
                  ...config,
                  match: { ...config.match, sidesPerMatch: Math.max(2, Number(e.target.value) || 2) },
                })
              }
              className={`${inputClass} tnum font-mono`}
            />
          </Field>

          <Toggle
            label="One side is at home"
            hint="Drives home and away balancing, and the order sides are listed in."
            checked={config.match.hasHomeSide}
            onChange={(hasHomeSide) => update({ ...config, match: { ...config.match, hasHomeSide } })}
          />
        </div>
      </Section>

      <Section label="How you win">
        <div className="grid gap-5 py-5 sm:grid-cols-2">
          <Field label="A result is recorded as">
            <Select
              value={config.score.kind}
              onChange={(e) => update({ ...config, score: scoreDefaults(e.target.value) })}
            >
              <option value="points">Points scored</option>
              <option value="sets">Sets or legs</option>
              <option value="outcome">Just who won</option>
              <option value="placement">A finishing order</option>
              <option value="time">A time</option>
            </Select>
          </Field>

          {config.score.kind === "points" ? (
            <>
              <Field label="Played to" hint="Leave blank for open-ended scoring such as goals.">
                <NumberInput
                  value={config.score.target ?? ""}
                  onChange={(e) =>
                    update({
                      ...config,
                      score: { ...config.score, target: e.target.value === "" ? null : Number(e.target.value) },
                    } as TournamentConfig)
                  }
                  placeholder="13"
                />
              </Field>
              <Toggle
                label="Draws are possible"
                checked={config.score.allowDraw}
                onChange={(allowDraw) =>
                  update({ ...config, score: { ...config.score, allowDraw } } as TournamentConfig)
                }
              />
            </>
          ) : null}

          {config.score.kind === "sets" ? (
            <Field label="Best of" hint="How many sets at most.">
              <NumberInput
                decimal
                value={config.score.bestOf}
                onChange={(e) =>
                  update({
                    ...config,
                    score: { ...config.score, bestOf: Math.max(1, Number(e.target.value) || 1) },
                  } as TournamentConfig)
                }
                />
            </Field>
          ) : null}

          {config.score.kind === "outcome" ? (
            <Toggle
              label="Draws are possible"
              checked={config.score.allowDraw}
              onChange={(allowDraw) =>
                update({ ...config, score: { ...config.score, allowDraw } } as TournamentConfig)
              }
            />
          ) : null}

          {config.score.kind === "placement" ? (
            <Field
              label="Points by finishing place"
              hint="Comma separated, best first. Leave blank to score by reverse order."
            >
              <NumberInput
                value={config.score.pointsByPlace.join(", ")}
                onChange={(e) =>
                  update({
                    ...config,
                    score: {
                      ...config.score,
                      pointsByPlace: e.target.value
                        .split(",")
                        .map((v) => Number(v.trim()))
                        .filter((v) => Number.isFinite(v)),
                    },
                  } as TournamentConfig)
                }
                placeholder="15, 12, 10, 8"
                className={`${inputClass} tnum font-mono`}
              />
            </Field>
          ) : null}

          {config.score.kind === "time" ? (
            <Toggle
              label="A higher figure is better"
              hint="For time survived or a distance, rather than a race."
              checked={!config.score.lowerIsBetter}
              onChange={(higher) =>
                update({
                  ...config,
                  score: { ...config.score, lowerIsBetter: !higher },
                } as TournamentConfig)
              }
            />
          ) : null}
        </div>
      </Section>

      <Section label="Who plays whom">
        <div className="grid gap-5 py-5 sm:grid-cols-2">
          <Field label="Pairing" hint="How each round is drawn.">
            <Select
              value={config.pairing.strategy}
              onChange={(e) =>
                update({
                  ...config,
                  pairing: { ...config.pairing, strategy: e.target.value as never },
                })
              }
            >
              <option value="seeded">Seeded — strongest meets weakest</option>
              <option value="random">Random draw</option>
              <option value="closest_record">Closest record — the Swiss idea</option>
              <option value="closest_rating">Closest rating</option>
              <option value="rating_spread">Widest rating gap</option>
              <option value="berger">Berger — everyone meets everyone</option>
            </Select>
          </Field>

          <Field label="Who sits out an odd round">
            <Select
              value={config.pairing.byePolicy}
              onChange={(e) =>
                update({
                  ...config,
                  pairing: { ...config.pairing, byePolicy: e.target.value as never },
                })
              }
            >
              <option value="lowest_ranked">The lowest ranked</option>
              <option value="highest_ranked">The leader</option>
              <option value="random">Drawn at random</option>
            </Select>
          </Field>
        </div>

        <div className="pb-5">
          <Label>Constraints</Label>
          <p className="text-ink-2 mt-1.5 max-w-[68ch] text-sm leading-relaxed">
            These are preferences, not hard rules. When a round cannot satisfy all of them — which
            happens in the last round of most Swiss events — the draw breaks the least important
            one and tells you which.
          </p>
          <div className="mt-3 space-y-3">
            <Toggle
              label="Avoid repeating a fixture"
              checked={config.pairing.constraints.avoidRematch.enabled}
              onChange={(enabled) =>
                update({
                  ...config,
                  pairing: {
                    ...config.pairing,
                    constraints: {
                      ...config.pairing.constraints,
                      avoidRematch: { ...config.pairing.constraints.avoidRematch, enabled },
                    },
                  },
                })
              }
            />
            <Toggle
              label="Spread byes around"
              checked={config.pairing.constraints.balanceByes.enabled}
              onChange={(enabled) =>
                update({
                  ...config,
                  pairing: {
                    ...config.pairing,
                    constraints: {
                      ...config.pairing.constraints,
                      balanceByes: { ...config.pairing.constraints.balanceByes, enabled },
                    },
                  },
                })
              }
            />
            <Toggle
              label="Keep entrants who share a field apart"
              hint={`Currently: ${config.pairing.constraints.avoidSameMeta.field}. Add the field on the Entrants tab.`}
              checked={config.pairing.constraints.avoidSameMeta.enabled}
              onChange={(enabled) =>
                update({
                  ...config,
                  pairing: {
                    ...config.pairing,
                    constraints: {
                      ...config.pairing.constraints,
                      avoidSameMeta: { ...config.pairing.constraints.avoidSameMeta, enabled },
                    },
                  },
                })
              }
            />
          </div>
        </div>
      </Section>

      <Section label="How points are awarded">
        <div className="grid gap-5 py-5 sm:grid-cols-3">
          <Field label="Points come from">
            <Select
              value={config.standings.pointsSource}
              onChange={(e) =>
                update({
                  ...config,
                  standings: { ...config.standings, pointsSource: e.target.value as never },
                })
              }
            >
              <option value="outcome">The result — a win is worth a fixed amount</option>
              <option value="score">The scoreline — what you actually scored</option>
            </Select>
          </Field>
          {(["win", "draw", "loss", "bye"] as const).map((key) => (
            <Field key={key} label={key === "bye" ? "A bye" : `A ${key}`}>
              <input
                value={config.standings.pointsSystem[key]}
                onChange={(e) =>
                  update({
                    ...config,
                    standings: {
                      ...config.standings,
                      pointsSystem: {
                        ...config.standings.pointsSystem,
                        [key]: Number(e.target.value) || 0,
                      },
                    },
                  })
                }
              />
            </Field>
          ))}
        </div>
      </Section>

      <Section label="Who ranks above whom" meta="Applied in order">
        <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
          Each is applied only to the entrants still level after the one before it. Put a
          strength-of-opposition measure high and a hard draw stops being a punishment; put point
          difference high and margins start to matter.
        </p>
        <ol>
          {config.standings.tiebreakers.map((tiebreaker, index) => (
            <li key={`${tiebreaker.key}-${index}`} className="border-rule flex items-center gap-2 border-b py-2">
              <span className="tnum text-ink-3 w-5 shrink-0 font-mono text-sm">{index + 1}</span>
              <Select
                value={tiebreaker.key}
                aria-label={`Tiebreaker ${index + 1}`}
                onChange={(e) => {
                  const next = config.standings.tiebreakers.slice();
                  next[index] = { ...tiebreaker, key: e.target.value as TiebreakerKey };
                  update({ ...config, standings: { ...config.standings, tiebreakers: next } });
                }}
                className="flex-1"
              >
                {TIEBREAKER_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {TIEBREAKER_TITLES[key] ?? key}
                  </option>
                ))}
              </Select>
              <Button
                variant="quiet"
                title="Reverse — lowest first"
                onClick={() => {
                  const next = config.standings.tiebreakers.slice();
                  next[index] = {
                    ...tiebreaker,
                    direction: tiebreaker.direction === "desc" ? "asc" : "desc",
                  };
                  update({ ...config, standings: { ...config.standings, tiebreakers: next } });
                }}
              >
                {tiebreaker.direction === "desc" ? "High first" : "Low first"}
              </Button>
              <Button
                variant="quiet"
                title="Move up"
                disabled={index === 0}
                onClick={() => {
                  const next = config.standings.tiebreakers.slice();
                  const above = next[index - 1];
                  if (!above) return;
                  next[index - 1] = tiebreaker;
                  next[index] = above;
                  update({ ...config, standings: { ...config.standings, tiebreakers: next } });
                }}
              >
                ↑
              </Button>
              <Button
                variant="quiet"
                title="Remove"
                onClick={() =>
                  update({
                    ...config,
                    standings: {
                      ...config.standings,
                      tiebreakers: config.standings.tiebreakers.filter((_, i) => i !== index),
                    },
                  })
                }
              >
                ×
              </Button>
            </li>
          ))}
        </ol>
        <div className="pt-3">
          <Button
            onClick={() =>
              update({
                ...config,
                standings: {
                  ...config.standings,
                  tiebreakers: [...config.standings.tiebreakers, { key: "drawn_lot", direction: "desc" }],
                },
              })
            }
          >
            Add a tiebreaker
          </Button>
        </div>
      </Section>

      <Section label="Ratings">
        <div className="grid gap-5 py-5 sm:grid-cols-2">
          <Field label="System">
            <Select
              value={config.rating.system}
              onChange={(e) =>
                update({ ...config, rating: { ...config.rating, system: e.target.value as never } })
              }
            >
              <option value="none">None</option>
              <option value="elo">Elo</option>
              <option value="glicko2">Glicko-2 — carries its own uncertainty</option>
              <option value="trueskill">TrueSkill-style — for teams and free-for-alls</option>
            </Select>
          </Field>
          {config.rating.system === "elo" ? (
            <>
              <Field label="K-factor" hint="How far one result can move a rating.">
                <input
                  value={config.rating.elo.k}
                  onChange={(e) =>
                    update({
                      ...config,
                      rating: {
                        ...config.rating,
                        elo: { ...config.rating.elo, k: Number(e.target.value) || 24 },
                      },
                    })
                  }
              />
              </Field>
              <Toggle
                label="Weight by margin of victory"
                hint="A convincing win moves ratings further than a narrow one."
                checked={config.rating.elo.marginOfVictory}
                onChange={(marginOfVictory) =>
                  update({
                    ...config,
                    rating: {
                      ...config.rating,
                      elo: { ...config.rating.elo, marginOfVictory },
                    },
                  })
                }
              />
            </>
          ) : null}
        </div>
      </Section>

      <Section label="Structure" meta={config.stages.map((s) => STAGE_LABELS[s.kind]).join(" → ")}>
        <ol className="py-3">
          {config.stages.map((stage, index) => (
            <li key={stage.id} className="border-rule border-b py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="tnum text-ink-3 w-5 font-mono text-sm">{index + 1}</span>
                <span className="text-ink text-sm font-medium">
                  {stage.name || STAGE_LABELS[stage.kind]}
                </span>
                <Label>{STAGE_LABELS[stage.kind]}</Label>
              </div>
              {(stage.kind === "single_elimination" || stage.kind === "double_elimination") ? (
                <p className="text-ink-2 mt-1.5 pl-8 text-sm">
                  Losers:{" "}
                  {
                    {
                      none: "go home",
                      third_place: "a play-off for third",
                      full_consolation: "a consolation bracket for everyone beaten in round one",
                      repechage: "a repechage into the final",
                    }[stage.consolation]
                  }
                </p>
              ) : null}
              {stage.kind === "swiss" ? (
                <p className="text-ink-2 mt-1.5 pl-8 text-sm">
                  {stage.rounds ? `${stage.rounds} rounds` : "Rounds derived from the field size"}
                </p>
              ) : null}
              {stage.kind === "round_robin" ? (
                <p className="text-ink-2 mt-1.5 pl-8 text-sm">
                  {stage.legs} leg{stage.legs === 1 ? "" : "s"}
                  {stage.legs > 1 && stage.mirrorLegs ? ", home and away" : ""}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
        <p className="text-ink-3 max-w-[68ch] text-xs leading-relaxed">
          Stage structure is edited in the raw configuration below — it is the one part with too
          many shapes for a form to cover honestly.
        </p>
      </Section>

      <RawConfig store={store} />
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="border-rule-strong accent-signal mt-0.5 size-4 shrink-0"
      />
      <span className="min-w-0">
        <span className="text-ink block text-sm">{label}</span>
        {hint ? <span className="text-ink-3 mt-0.5 block text-xs leading-snug">{hint}</span> : null}
      </span>
    </label>
  );
}

/**
 * The escape hatch.
 *
 * Anything the guided controls do not reach — stage pipelines, bonus point rules,
 * pairing weights — is reachable here, validated on every keystroke so a mistake
 * is named before it can be committed.
 */
function RawConfig({ store }: { store: Store }) {
  const { state, dispatch } = store;
  const [text, setText] = useState(() => JSON.stringify(state.config, null, 2));
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const check = (value: string): unknown | null => {
    try {
      const parsed = JSON.parse(value);
      const result = safeParseConfig(parsed);
      if (!result.success) {
        const issue = result.error.issues[0];
        setProblem(issue ? `${issue.path.join(".") || "config"}: ${issue.message}` : "Invalid configuration.");
        return null;
      }
      setProblem(null);
      return parsed;
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : "That is not valid JSON.");
      return null;
    }
  };

  return (
    <Section label="Raw configuration" meta="Everything, including what the controls above do not cover">
      <div className="py-5">
        <textarea
          value={text}
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
            check(e.target.value);
          }}
          rows={18}
          aria-label="Raw tournament configuration"
          className={`${inputClass} resize-y font-mono text-xs leading-relaxed`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={problem !== null}
            onClick={() => {
              const parsed = check(text);
              if (!parsed) return;
              dispatch({ type: "config_replaced", config: parsed as never });
              setSaved(true);
            }}
          >
            Apply
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              setText(JSON.stringify(state.config, null, 2));
              setProblem(null);
              setSaved(false);
            }}
          >
            Revert
          </Button>
          {saved ? <span className="text-ink-2 text-sm">Applied.</span> : null}
        </div>
        {problem ? (
          <div className="mt-3">
            <Notice tone="warn">{problem}</Notice>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

function scoreDefaults(kind: string): TournamentConfig["score"] {
  switch (kind) {
    case "sets":
      return { kind: "sets", bestOf: 3, setTarget: null, setWinBy: 1, decidingSetTarget: null, allowDraw: false };
    case "outcome":
      return { kind: "outcome", allowDraw: true };
    case "placement":
      return { kind: "placement", pointsByPlace: [], allowTies: false };
    case "time":
      return { kind: "time", lowerIsBetter: true, allowDraw: false };
    default:
      return {
        kind: "points",
        target: null,
        cap: null,
        allowDraw: false,
        marginMeaningful: true,
        integerOnly: true,
      };
  }
}
