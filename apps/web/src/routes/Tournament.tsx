/**
 * The tournament.
 *
 * A masthead, a control strip that only ever offers the one thing that can
 * happen next, and the sheet itself. The organiser should never have to work out
 * which button starts the round.
 */

import {
  advanceStage,
  isStageComplete,
  nextStageToStart,
  startStage,

} from "@bracketeer/engine";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Route, Routes, useLocation, useParams } from "react-router";
import { Masthead } from "../components/Masthead.js";
import { Button, Notice } from "../components/Sheet.js";
import { decode } from "../lib/codec.js";
import { STAGE_LABELS } from "../lib/format.js";
import { shareLink } from "../lib/share.js";
import { useTournament } from "../lib/useTournament.js";
import { PeerBar, usePeers, type PeerState } from "../sync/PeerBar.js";
import { CalendarPanel } from "./panels/Calendar.js";
import { ConfigPanel } from "./panels/Config.js";
import { DrawPanel } from "./panels/Draw.js";
import { EntrantsPanel } from "./panels/Entrants.js";
import { FixturesPanel } from "./panels/Fixtures.js";
import { SharePanel } from "./panels/Share.js";
import { StandingsPanel } from "./panels/Standings.js";
import { NotFound } from "./NotFound.js";

const TABS = [
  { to: "", label: "Fixtures", end: true },
  { to: "draw", label: "Draw" },
  { to: "standings", label: "Standings" },
  { to: "calendar", label: "Calendar" },
  { to: "entrants", label: "Entrants" },
  { to: "rules", label: "Rules" },
  { to: "share", label: "Share" },
];

export function TournamentRoute() {
  const { id = "" } = useParams();
  const location = useLocation();

  /**
   * A shared link carries the whole tournament in the hash. Read it once, on
   * mount, so that later edits are not overwritten by the URL the reader arrived
   * on.
   */
  const fromLink = useMemo(() => {
    const data = new URLSearchParams(location.search).get("d");
    if (!data) return undefined;
    try {
      return decode(data);
    } catch {
      return undefined;
    }
  }, []);

  const [linkFailed] = useState(() => {
    const data = new URLSearchParams(location.search).get("d");
    if (!data) return false;
    try {
      decode(data);
      return false;
    } catch {
      return true;
    }
  });

  /**
   * A link shared while sync was on carries `live=1`. Without it the person
   * receiving the link has no idea they are meant to join anything, which is
   * what made live sync look broken: one side waiting, the other unaware.
   */
  const [invited] = useState(() => new URLSearchParams(location.search).get("live") === "1");

  /** An organiser link carries the key that lets this device push changes. */
  const [keyFromLink] = useState(
    () => new URLSearchParams(location.search).get("k") ?? undefined,
  );

  const store = useTournament(id, fromLink, keyFromLink);
  const peers = usePeers(store);
  const { state } = store;

  useEffect(() => {
    document.title = state.name ? `${state.name} — Bracketeer` : "Bracketeer";
  }, [state.name]);

  if (!id) return <NotFound />;

  const untouched = store.log.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-5 pb-24">
      <Masthead>
        <PeerBar peers={peers} />
      </Masthead>

      {untouched ? (
        <div className="py-16">
          <Notice tone="warn">
            {linkFailed
              ? "This link could not be read. It may have been truncated in transit — ask whoever sent it to share it again, or to send you the exported file instead."
              : "This address alone carries no tournament, and there is no copy of it on this device. A Bracketeer link holds the whole event inside it, so it is long — if somebody copied it out of their browser bar rather than using the Copy link button, ask them for the full one."}
          </Notice>
        </div>
      ) : (
        <>
          <div className="border-rule border-b py-4">
            <h1 className="text-ink text-2xl font-semibold tracking-[-0.02em]">{state.name}</h1>
            <p className="text-ink-2 mt-0.5 text-sm">
              {state.config.stages.map((s) => STAGE_LABELS[s.kind] ?? s.kind).join(" → ")}
              {" · "}
              {state.entrants.filter((e) => e.status === "active").length} entrants
            </p>
          </div>

          {!store.persisted ? (
            <div className="mt-4">
              <Notice tone="warn">
                This browser is refusing to save. Your tournament is safe in this tab but will be
                lost if you close it — export a file from the Share tab to keep it.
              </Notice>
            </div>
          ) : null}

          <LiveBanner peers={peers} invited={invited && store.canPush} />
          <ControlStrip store={store} peers={peers} />

          <nav className="no-print border-rule-strong mt-6 flex gap-1 overflow-x-auto border-b-2">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to ? `/t/${id}/${tab.to}` : `/t/${id}`}
                end={tab.end}
                className={({ isActive }) =>
                  `sheet-label -mb-0.5 shrink-0 border-b-2 px-3 py-2 transition-colors ${
                    isActive
                      ? "border-signal text-ink"
                      : "text-ink-3 hover:text-ink border-transparent"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-8">
            <Routes>
              <Route index element={<FixturesPanel store={store} />} />
              <Route path="draw" element={<DrawPanel store={store} />} />
              <Route path="standings" element={<StandingsPanel store={store} />} />
              <Route path="calendar" element={<CalendarPanel store={store} />} />
              <Route path="entrants" element={<EntrantsPanel store={store} />} />
              <Route path="rules" element={<ConfigPanel store={store} />} />
              <Route path="share" element={<SharePanel store={store} peers={peers} />} />
            </Routes>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * What can happen next.
 *
 * Only ever one primary action, worked out from the state rather than left to
 * the organiser to deduce: open the next stage, draw the next round, or nothing
 * because there are results outstanding.
 */
function ControlStrip({
  store,
  peers,
}: {
  store: ReturnType<typeof useTournament>;
  peers: PeerState;
}) {
  const { state, dispatch } = store;

  const action = useMemo(() => {
    const toStart = nextStageToStart(state);
    if (toStart) {
      const config = state.config.stages.find((s) => s.id === toStart);
      const started = state.stages.length > 0;
      return {
        label: started ? `Start ${config?.name || STAGE_LABELS[config?.kind ?? ""] || "next stage"}` : "Start the tournament",
        run: () => dispatch(startStage(state, toStart)),
        enabled: state.entrants.some((e) => e.status === "active"),
        note: state.entrants.some((e) => e.status === "active")
          ? null
          : "Add some entrants first.",
      };
    }

    for (const stage of state.stages) {
      const events = advanceStage(state, stage.id);
      if (events.length > 0) {
        return {
          label: "Draw the next round",
          run: () => dispatch(events),
          enabled: true,
          note: null,
        };
      }
    }

    const running = state.stages.find((s) => !isStageComplete(state, s.id));
    if (running) {
      const outstanding = state.matches.filter(
        (m) => m.stageId === running.id && m.status === "ready",
      ).length;
      return {
        label: null,
        run: () => {},
        enabled: false,
        note: outstanding > 0 ? `${outstanding} fixture${outstanding === 1 ? "" : "s"} still to be played.` : null,
      };
    }

    return { label: null, run: () => {}, enabled: false, note: "Every stage is complete." };
  }, [state, dispatch]);

  return (
    <div className="no-print border-rule mt-4 flex flex-wrap items-center gap-3 border-b py-3">
      {action.label ? (
        <Button variant="primary" onClick={action.run} disabled={!action.enabled} className="min-h-10">
          {action.label}
        </Button>
      ) : null}
      {action.note ? <span className="text-ink-2 text-sm">{action.note}</span> : null}
      <div className="ml-auto flex items-center gap-1">
        {store.canPush ? <ShareLinkButton store={store} /> : null}
        {/* Live sync is between organiser links only, so a watch link is not
            offered a control it could never complete. */}
        {store.canPush ? (
          <Button
            variant="quiet"
            onClick={
              peers.status === "off" || peers.status === "unavailable" ? peers.start : peers.stop
            }
            title={
              peers.status === "live"
                ? "Stop syncing with other devices"
                : "Let other phones update this tournament at the same time"
            }
          >
            {peers.status === "live" ? "Live" : peers.status === "connecting" ? "…" : "Go live"}
          </Button>
        ) : null}
        <Button variant="quiet" onClick={store.undo} disabled={!store.canUndo} title="Undo your last change">
          Undo
        </Button>
      </div>
    </div>
  );
}

/**
 * The link, one tap from anywhere.
 *
 * The address bar reads `#/t/abc123` and carries no tournament at all, so
 * copying it — the obvious thing to do — sends somebody an address that means
 * nothing on their device. The real link is long and lives on the Share tab,
 * which is no use at the moment you are actually sharing.
 *
 * It is deliberately the *watch* link. This is the control people reach for
 * without thinking, so it has to be the one that gives away least; anybody who
 * wants to hand over score entry can say so on the Share tab, where the warning
 * about it is. A convenient control that shares more than the deliberate one is
 * how private data escapes.
 */
function ShareLinkButton({ store }: { store: Store }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const { url } = shareLink({
      id: store.id,
      log: store.log,
      config: store.state.config,
      audience: "watch",
      writeKey: store.writeKey,
      live: false,
    });
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Button
      variant="quiet"
      onClick={() => void copy()}
      title="Copy a watch link — results only, no score entry. The address bar carries nothing."
    >
      {copied ? "Link copied" : "Copy link"}
    </Button>
  );
}

/**
 * The invitation, and the honest state of it.
 *
 * Joining opens a connection to public relays, so it is one deliberate tap
 * rather than something that happens silently because a link said so. Once
 * connected and alone, it says what to do next instead of showing "waiting"
 * forever, which is indistinguishable from broken.
 */
function LiveBanner({ peers, invited }: { peers: PeerState; invited: boolean }) {
  if (peers.status === "off" && invited) {
    return (
      <div className="no-print border-rule bg-signal-wash mt-4 flex flex-wrap items-center gap-3 border-b px-3 py-2.5">
        <span className="text-signal-ink flex-1 text-sm">
          This tournament is being run live. Join and you will see scores as they are entered — and
          can enter them yourself.
        </span>
        <Button variant="primary" onClick={peers.start}>
          Join
        </Button>
      </div>
    );
  }

  if (peers.status === "live" && peers.count === 0) {
    return (
      <div className="no-print border-rule mt-4 flex flex-wrap items-center gap-3 border-b px-3 py-2.5">
        <span className="text-ink-2 flex-1 text-sm">
          Live, but nobody else has joined yet. Use <strong className="font-medium">Copy link</strong>{" "}
          — the address in your browser bar carries no tournament, so sending that gets you nowhere.
        </span>
      </div>
    );
  }

  if (peers.status === "unavailable") {
    return (
      <div className="no-print mt-4">
        <Notice tone="warn">{peers.error ?? "Live sync is not available on this network."}</Notice>
      </div>
    );
  }

  return null;
}

export type Store = ReturnType<typeof useTournament>;
