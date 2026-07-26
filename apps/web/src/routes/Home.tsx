/**
 * The front page.
 *
 * Two jobs: start a tournament, or return to one. Anything else is in the way of
 * somebody standing in a car park about to run an event.
 */

import { replay } from "@bracketeer/engine";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Masthead } from "../components/Masthead.js";
import { Button, Empty, Figure, Label, Notice, Row, Section } from "../components/Sheet.js";
import { decode } from "../lib/codec.js";
import { STAGE_LABELS } from "../lib/format.js";
import { forgetTournament, listTournaments, randomId, saveLog } from "../lib/storage.js";
import { fromJsonFile } from "@bracketeer/engine";

export function Home() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState(() => listTournaments());
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const openFile = async (file: File) => {
    try {
      const log = fromJsonFile(await file.text());
      const state = replay(log);
      const id = randomId();
      saveLog(id, log, { name: state.name || "Imported", entrants: state.entrants.length });
      navigate(`/t/${id}`);
    } catch (cause) {
      // fromJsonFile explains a wrong-format or newer-version file usefully.
      // Anything else is a JSON parse error, whose message means nothing to
      // somebody who just picked the wrong file out of their downloads.
      const message = cause instanceof Error ? cause.message : "";
      setError(
        message.includes("Bracketeer")
          ? message
          : "That file could not be read. It should be a .json file exported from Bracketeer.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24">
      <Masthead />

      <div className="border-rule-strong border-b-2 py-10">
        <h1 className="text-ink max-w-[18ch] text-4xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-5xl">
          Run the tournament, not the software.
        </h1>
        <p className="text-ink-2 mt-4 max-w-[62ch] text-base leading-relaxed">
          Brackets, Swiss pairings, leagues and Elo — for any sport, because the rules are
          yours to compose. Everything runs in this browser. There is no account, no server,
          and nothing to pay for.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={() => navigate("/new")} className="min-h-11 px-5">
            Start a tournament
          </Button>
          <Button onClick={() => fileInput.current?.click()} className="min-h-11">
            Open a file
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            aria-label="Open a tournament file"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void openFile(file);
              event.target.value = "";
            }}
          />
        </div>
        {error ? (
          <div className="mt-4">
            <Notice tone="warn">{error}</Notice>
          </div>
        ) : null}
      </div>

      <div className="mt-10">
        <Section label="On this device" meta={tournaments.length > 0 ? `${tournaments.length} saved` : undefined}>
          {tournaments.length === 0 ? (
            <Empty title="Nothing here yet">
              Tournaments you create are kept in this browser. Share the link or export a file
              to move one somewhere else.
            </Empty>
          ) : (
            <ul>
              {tournaments.map((tournament) => (
                <li key={tournament.id}>
                  <Row>
                    <Link
                      to={`/t/${tournament.id}`}
                      className="min-w-0 flex-1 truncate font-medium hover:underline"
                    >
                      {tournament.name}
                    </Link>
                    <Figure className="hidden text-xs sm:inline">
                      {tournament.entrants} entrant{tournament.entrants === 1 ? "" : "s"}
                    </Figure>
                    <Figure className="text-xs">
                      {new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(
                        tournament.updatedAt,
                      )}
                    </Figure>
                    <Button
                      variant="quiet"
                      ariaLabel={`Remove ${tournament.name} from this device`}
                      title={`Remove ${tournament.name} from this device`}
                      onClick={() => {
                        forgetTournament(tournament.id);
                        setTournaments(listTournaments());
                      }}
                    >
                      Remove
                    </Button>
                  </Row>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Explainer />
    </div>
  );
}

/**
 * The six axes, stated plainly. This is the product's actual idea, so it earns
 * space on the front page — but as a table of what composes into what, not as a
 * row of feature cards.
 */
function Explainer() {
  const axes = useMemo(
    () => [
      { axis: "Who plays", options: "one person · a fixed team · partners redrawn each round" },
      { axis: "How you win", options: "a score · sets · a verdict · a finishing order · a time" },
      { axis: "The shape", options: Object.values(STAGE_LABELS).join(" · ").toLowerCase() },
      { axis: "If you lose", options: "nothing · third place · a consolation bracket · repechage" },
      { axis: "Who plays whom", options: "seeded · random · closest record · closest rating · widest gap" },
      { axis: "Who ranks above", options: "your own ordered list of tiebreakers" },
    ],
    [],
  );

  return (
    <div className="mt-14">
      <Section label="Composed, not preset">
        <p className="text-ink-2 max-w-[68ch] py-4 text-sm leading-relaxed">
          There are no modes and no sports. There are six independent choices, and every structure
          is what you get by combining them. Pair people by their record, give the first-round
          losers a bracket of their own, break ties by how hard somebody's draw was — that is one
          event. Change three of those settings and it is a different one. Nothing in here knows or
          cares what you play.
        </p>
        <dl>
          {axes.map((row) => (
            <div key={row.axis} className="border-rule flex flex-wrap gap-x-6 gap-y-1 border-b py-2.5">
              <dt className="w-40 shrink-0">
                <Label>{row.axis}</Label>
              </dt>
              <dd className="text-ink-2 min-w-0 flex-1 text-sm">{row.options}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <p className="text-ink-3 mt-8 text-xs leading-relaxed">
        Open source under the MIT licence.{" "}
        <a
          className="hover:text-ink underline underline-offset-2"
          href="https://github.com/maxgfr/bracketeer"
        >
          Source on GitHub
        </a>
        .
      </p>
    </div>
  );
}

/** Shared by the routes that need to read a tournament out of the link. */
export function logFromHash(search: string) {
  const data = new URLSearchParams(search).get("d");
  if (!data) return null;
  try {
    return decode(data);
  } catch {
    return null;
  }
}
