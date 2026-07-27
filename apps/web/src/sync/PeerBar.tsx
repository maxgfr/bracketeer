/**
 * Live sync between devices.
 *
 * With no server of our own, peers introduce themselves through public
 * infrastructure and then talk directly. That is genuinely zero-hosting, and it
 * is genuinely less reliable than a server: the relays are outside our control
 * and some networks block them outright.
 *
 * So the design refuses to pretend. Sync is opt-in, its state is always visible,
 * and the durable copies remain the share link and the exported file. Merging is
 * safe because the log is a set of immutable events — two devices that were
 * apart for ten minutes converge on the union, in the same order, every time.
 */

import { mergeLogs, type EventLog } from "@bracketeer/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { Label } from "../components/Sheet.js";
import type { TournamentStore } from "../lib/useTournament.js";

export type PeerStatus = "off" | "connecting" | "live" | "unavailable";

export interface PeerState {
  status: PeerStatus;
  count: number;
  error: string | null;
  start: () => void;
  stop: () => void;
}

interface Session {
  leave: () => void;
  broadcast: (log: EventLog) => void;
}

/**
 * Trystero is loaded on demand rather than bundled into the first paint: most
 * visitors are reading a shared link, not running a live event, and they should
 * not pay to download a WebRTC stack they never use.
 *
 * Logs cross the wire as JSON text. The transport accepts structured values, but
 * a string is the one shape that cannot be quietly reinterpreted in transit, and
 * the payload is small once it is a log rather than a rendered tournament.
 */
/**
 * The wire contract, exported so a test can drive the other side of it with the
 * same values rather than a copy that can drift.
 */
export const SYNC_APP_ID = "bracketeer";
export const SYNC_ACTION = "log";

export interface SessionHandlers {
  readLog: () => EventLog;
  /**
   * The tournament's write key, or null on a device holding a watch link.
   *
   * Peers attach it to what they send and refuse what arrives without it, so a
   * watch link can follow along and cannot change anybody else's tournament.
   * This is a shared secret passed between people who already trust each other,
   * not authentication — it stops the wrong link being used by accident, which
   * is the failure that actually happens.
   */
  writeKey: string | null;
  onIncoming: (log: EventLog) => void;
  onPeerCount: (count: number) => void;
  onError: (message: string) => void;
  /** Anything the transport can pass through for a WebRTC implementation. */
  rtcPolyfill?: unknown;
}

export async function openSession(roomId: string, handlers: SessionHandlers): Promise<Session> {
  const { joinRoom } = await import("trystero/nostr");

  const room = joinRoom(
    {
      appId: SYNC_APP_ID,
      ...(handlers.rtcPolyfill ? { rtcPolyfill: handlers.rtcPolyfill as never } : {}),
    },
    roomId,
    {
      // Without this, a relay that refuses the connection fails silently and the
      // interface sits on "waiting" forever with nothing to tell the organiser.
      onJoinError: (details: { error?: unknown }) =>
        handlers.onError(
          details?.error instanceof Error
            ? `Could not reach the peer network: ${details.error.message}`
            : "Could not reach the peer network. This connection may be blocking it.",
        ),
    },
  );

  const action = room.makeAction<string>(SYNC_ACTION);
  const envelope = (log: EventLog) => JSON.stringify({ k: handlers.writeKey, log });

  action.onMessage = (payload) => {
    try {
      const parsed = JSON.parse(payload) as { k?: string | null; log?: EventLog };
      // Without the key this is somebody reading over your shoulder, not
      // somebody helping run the tournament.
      if (!parsed.k || parsed.k !== handlers.writeKey) return;
      if (Array.isArray(parsed.log)) handlers.onIncoming(parsed.log);
    } catch {
      // A malformed payload from an unknown peer is ignored rather than allowed
      // to take down the organiser's tab.
    }
  };

  const count = () => Object.keys(room.getPeers()).length;

  room.onPeerJoin = () => {
    handlers.onPeerCount(count());
    // Whoever arrives gets everything we have; merging sorts out the rest.
    void action.send(envelope(handlers.readLog()));
  };
  room.onPeerLeave = () => handlers.onPeerCount(count());

  return {
    leave: () => void room.leave(),
    broadcast: (log) => void action.send(envelope(log)),
  };
}

export function usePeers(tournamentId: string, store: TournamentStore): PeerState {
  const [status, setStatus] = useState<PeerStatus>("off");
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const session = useRef<Session | null>(null);
  // Read through a ref so the room's callbacks always see the current log
  // without the session being torn down and rebuilt on every score.
  const logRef = useRef<EventLog>(store.log);
  logRef.current = store.log;

  const absorb = store.absorb;

  const start = useCallback(() => {
    if (session.current) return;
    setStatus("connecting");
    setError(null);

    openSession(tournamentId, {
      readLog: () => logRef.current,
      writeKey: store.writeKey || null,
      onIncoming: (incoming) => absorb(mergeLogs([], incoming)),
      onPeerCount: setCount,
      onError: (message) => {
        setStatus("unavailable");
        setError(message);
      },
    })
      .then((opened) => {
        session.current = opened;
        setStatus("live");
      })
      .catch((cause: unknown) => {
        setStatus("unavailable");
        setError(
          cause instanceof Error
            ? `Live sync could not start: ${cause.message}`
            : "Live sync could not start. This network may be blocking peer-to-peer connections.",
        );
      });
  }, [tournamentId, absorb]);

  const stop = useCallback(() => {
    session.current?.leave();
    session.current = null;
    setStatus("off");
    setCount(0);
  }, []);

  // Push our log whenever it changes, so a score entered here reaches the other
  // phones in the hall.
  useEffect(() => {
    if (status === "live") session.current?.broadcast(store.log);
  }, [store.log, status]);

  useEffect(() => () => session.current?.leave(), []);

  return { status, count, error, start, stop };
}

export function PeerBar({ peers }: { peers: PeerState }) {
  if (peers.status === "off") return null;

  const text =
    peers.status === "connecting"
      ? "Connecting…"
      : peers.status === "unavailable"
        ? "Sync unavailable"
        : peers.count === 0
          ? "Live · waiting"
          : `Live · ${peers.count} device${peers.count === 1 ? "" : "s"}`;

  return (
    <span className="flex items-center gap-1.5 px-2" title={peers.error ?? undefined}>
      <span
        aria-hidden
        className={`inline-block size-1.5 rounded-full ${
          peers.status === "live" ? "bg-signal" : "bg-ink-3"
        }`}
      />
      <Label>{text}</Label>
    </span>
  );
}
