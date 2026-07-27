/**
 * A schematic of what a shape actually does.
 *
 * Drawn from the structure the engine produced, not from a description of it —
 * see `simulate/` in the engine. Every line here corresponds to a fixture that exists.
 *
 * The language is the sheet's: hairlines, right angles, one signal colour for
 * the thing that makes this shape different from its neighbours. No labels
 * inside the drawing; the row already carries the words.
 */

import { useMemo } from "react";
import { readShape, type BracketShape, type Shape, type StageShape } from "@bracketeer/engine";
import type { TournamentConfigInput } from "@bracketeer/engine";

const HEIGHT = 96;
const PAD = 6;
const COLUMN = 22;
const GAP = 26;
/** Beyond this a drawing stops being readable and starts being a texture. */
const MAX_COLUMNS = 6;

export function ShapeDiagram({
  config,
  entrants = 16,
  className = "",
}: {
  config: TournamentConfigInput;
  entrants?: number;
  className?: string;
}) {
  const shape = useMemo(() => {
    try {
      return readShape(config, entrants);
    } catch {
      return null;
    }
  }, [config, entrants]);

  if (!shape || shape.stages.length === 0) return null;

  const blocks = shape.stages.map(layoutStage);
  const width =
    blocks.reduce((sum, b) => sum + b.width, 0) + GAP * (blocks.length - 1) + PAD * 2;

  let x = PAD;

  return (
    /*
      Drawn at a fixed scale, never stretched to fit.
      
      Sizing the SVG to its container makes every diagram a different size: a
      four-round knockout is squeezed thin while a stepladder balloons, and two
      pictures of the same thing stop being comparable. So a column is always the
      same number of pixels wide and a rule is always the same weight, and a wide
      structure simply scrolls.
    */
    <div className={`overflow-x-auto ${className}`}>
      <svg
        viewBox={`0 0 ${Math.max(width, 80)} ${HEIGHT}`}
        width={Math.max(width, 80)}
        height={HEIGHT}
        className="text-ink-3 block max-w-none"
        role="img"
        aria-label={describe(shape)}
      >
        {blocks.map((block, index) => {
          const offset = x;
          x += block.width + GAP;
          return (
            <g key={block.stage.id} transform={`translate(${offset} 0)`}>
              {block.render()}
              {index < blocks.length - 1 ? <Arrow x={block.width + 7} /> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Layout
 * ──────────────────────────────────────────────────────────────────────────── */

interface Block {
  stage: StageShape;
  width: number;
  render: () => React.ReactNode;
}

function layoutStage(stage: StageShape): Block {
  if (stage.kind === "ladder") {
    return { stage, width: 46, render: () => <Ladder /> };
  }

  if (stage.groupCount > 0) {
    const shown = Math.min(stage.groupCount, 4);
    return {
      stage,
      width: 30,
      render: () => <Groups shown={shown} total={stage.groupCount} />,
    };
  }

  const main = stage.brackets.find((b) => b.slot === "main") ?? stage.brackets[0];
  const extras = stage.brackets.filter((b) => b !== main);

  if (!main) return { stage, width: 30, render: () => <Groups shown={1} total={1} /> };

  const columns = Math.min(main.rounds.length, MAX_COLUMNS);
  const width = Math.max(columns * COLUMN, 28);

  return {
    stage,
    width,
    render: () => (
      <>
        <Bracket
          bracket={main}
          columns={columns}
          top={extras.length > 0 ? 2 : PAD}
          height={extras.length > 0 ? HEIGHT * 0.56 : HEIGHT - PAD * 2}
          sidesPerMatch={stage.sidesPerMatch}
        />
        {extras.length > 0 ? (
          <Bracket
            bracket={extras[0] as BracketShape}
            columns={Math.min((extras[0] as BracketShape).rounds.length, MAX_COLUMNS)}
            top={HEIGHT * 0.62}
            height={HEIGHT * 0.34}
            sidesPerMatch={stage.sidesPerMatch}
            accent
          />
        ) : null}
      </>
    ),
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Parts
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A bracket, or a strip of rounds.
 *
 * A tree gets the classic elbow joins, because that is the thing being said:
 * these two fixtures produce the one to their right. Rounds drawn afresh each
 * time get no joins — nothing carries forward, which is equally the point.
 */
function Bracket({
  bracket,
  columns,
  top,
  height,
  sidesPerMatch,
  accent = false,
}: {
  bracket: BracketShape;
  columns: number;
  top: number;
  height: number;
  sidesPerMatch: number;
  accent?: boolean;
}) {
  const stroke = accent ? "var(--signal)" : "currentColor";
  const parts: React.ReactNode[] = [];

  for (let column = 0; column < columns; column += 1) {
    const count = bracket.rounds[column] ?? 1;
    const x = column * COLUMN;
    const slotHeight = height / count;

    for (let i = 0; i < count; i += 1) {
      const centre = top + slotHeight * (i + 0.5);

      // The fixture itself: one tick per side, so a four-way heat reads as four.
      const sides = Math.min(sidesPerMatch, 4);
      const spread = Math.min(slotHeight * 0.45, 3.5 * (sides - 1));
      for (let s = 0; s < sides; s += 1) {
        const y = sides === 1 ? centre : centre - spread + (spread * 2 * s) / (sides - 1);
        parts.push(
          <line
            key={`m${column}-${i}-${s}`}
            x1={x}
            y1={y}
            x2={x + 12}
            y2={y}
            stroke={stroke}
            strokeWidth={1.25}
            strokeLinecap="round"
          />,
        );
      }

      // The join into the next round, which only a tree has.
      if (bracket.isTree && column + 1 < columns) {
        const nextCount = bracket.rounds[column + 1] ?? count;
        const nextSlot = height / nextCount;
        const target = top + nextSlot * (Math.floor(i / (count / nextCount)) + 0.5);
        parts.push(
          <path
            key={`j${column}-${i}`}
            d={`M ${x + 12} ${centre} H ${x + 17} V ${target} H ${x + COLUMN}`}
            fill="none"
            stroke={stroke}
            strokeWidth={0.75}
            opacity={0.55}
            shapeRendering="crispEdges"
          />,
        );
      }
    }
  }

  // More rounds than fit: say so rather than implying the shape ends here.
  if (bracket.rounds.length > columns) {
    parts.push(
      <text
        key="more"
        x={columns * COLUMN - 4}
        y={top + height / 2 + 3}
        fontSize={9}
        fill={stroke}
        opacity={0.7}
      >
        …
      </text>,
    );
  }

  return <>{parts}</>;
}

/** Groups: separate boxes that play among themselves before anything joins up. */
function Groups({ shown, total }: { shown: number; total: number }) {
  const boxHeight = (HEIGHT - PAD * 2 - (shown - 1) * 4) / shown;

  return (
    <>
      {Array.from({ length: shown }, (_, i) => {
        const y = PAD + i * (boxHeight + 4);
        return (
          <g key={i}>
            <rect
              x={0}
              y={y}
              width={22}
              height={boxHeight}
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              rx={1}
            />
            {/* Everyone inside meets everyone inside. */}
            {[0.32, 0.5, 0.68].map((f, j) => (
              <line
                key={j}
                x1={5}
                y1={y + boxHeight * f}
                x2={17}
                y2={y + boxHeight * f}
                stroke="currentColor"
                strokeWidth={0.75}
                opacity={0.5}
              />
            ))}
          </g>
        );
      })}
      {total > shown ? (
        <text x={9} y={HEIGHT - 1} fontSize={8} fill="currentColor" opacity={0.7}>
          ×{total}
        </text>
      ) : null}
    </>
  );
}

/** A ladder: rungs, and the one thing you can do — climb. */
function Ladder() {
  const rungs = 5;
  const step = (HEIGHT - PAD * 2) / rungs;

  return (
    <>
      {Array.from({ length: rungs }, (_, i) => (
        <line
          key={i}
          x1={4}
          y1={PAD + step * (i + 0.5)}
          x2={30}
          y2={PAD + step * (i + 0.5)}
          stroke="currentColor"
          strokeWidth={1.25}
          strokeLinecap="round"
        />
      ))}
      <path
        d={`M 36 ${HEIGHT - PAD - step * 0.5} V ${PAD + step * 0.9} l -3 4 m 3 -4 l 3 4`}
        fill="none"
        stroke="var(--signal)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

function Arrow({ x }: { x: number }) {
  return (
    <path
      d={`M ${x} ${HEIGHT / 2} h 12 m -4 -3 l 4 3 l -4 3`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.6}
    />
  );
}

/** What a screen reader says, since the drawing itself carries no words. */
export function describe(shape: Shape): string {
  const parts = shape.stages.map((stage) => {
    if (stage.kind === "ladder") return "an open-ended challenge ladder";

    const rounds = stage.brackets.find((b) => b.slot === "main")?.rounds.length ?? 0;
    const extra = stage.brackets.filter((b) => b.slot !== "main").length;

    const base =
      stage.groupCount > 0
        ? `${stage.groupCount} groups of ${Math.round(stage.entrants / stage.groupCount)}`
        : `${rounds} round${rounds === 1 ? "" : "s"} for ${stage.entrants} entrants`;

    return extra > 0 ? `${base}, with ${extra} further bracket${extra === 1 ? "" : "s"}` : base;
  });

  return `Structure: ${parts.join(", then ")}.`;
}
