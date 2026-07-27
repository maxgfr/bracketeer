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
 *
 * **The room is derived from the organiser key, and the key never goes on the
 * wire.** An earlier version named the room after the tournament id and put the
 * key in every message, which got both halves wrong at once: the id travels in
 * every watch link, so the room was one anybody could walk into, and once inside
 * they were handed the key that let them push. Membership is now the credential
 * — you cannot find the room without the secret, so nothing sent inside it needs
 * to carry proof of holding one.
 */

import { mergeLogs, roomIdFor, type EventLog } from "@bracketeer/engine";
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
/** Bumped when the payload shape changes, so an old peer is ignored rather than misread. */
export const SYNC_WIRE_VERSION = 2;

/**
 * What goes on the wire, and what is accepted off it.
 *
 * Pulled out of `openSession` so the invariant can be tested without two
 * browsers and a public relay. The important assertion — that nothing here
 * carries the organiser key — used to live inside the peer-to-peer test, which
 * is skipped unless `RUN_P2P_TESTS` is set and therefore never ran in CI. The
 * guarantee that matters most was the one nothing was checking.
 */
export function wireEnvelope(log: EventLog): string {
  return JSON.stringify({ v: SYNC_WIRE_VERSION, log });
}

/** The log inside a payload, or null if it is not one we should act on. */
export function logFromWire(payload: string): EventLog | null {
  try {
    const parsed = JSON.parse(payload) as { v?: number; log?: EventLog };
    if (parsed.v !== SYNC_WIRE_VERSION) return null;
    return Array.isArray(parsed.log) ? parsed.log : null;
  } catch {
    // A malformed payload from an unknown peer is ignored rather than allowed
    // to take down the organiser's tab.
    return null;
  }
}

export interface SessionHandlers {
  readLog: () => EventLog;
  /**
   * The organiser key, used to encrypt signalling — never sent as data.
   *
   * The room name is already a one-way function of this, so anybody who found
   * the room holds the secret. Putting it in the messages as well would only
   * mean handing it to whoever got in.
   */
  password: string;
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
      password: handlers.password,
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

  action.onMessage = (payload) => {
    const incoming = logFromWire(payload);
    if (incoming) handlers.onIncoming(incoming);
  };

  const count = () => Object.keys(room.getPeers()).length;

  room.onPeerJoin = () => {
    handlers.onPeerCount(count());
    // Whoever arrives gets everything we have; merging sorts out the rest.
    void action.send(wireEnvelope(handlers.readLog()));
  };
  room.onPeerLeave = () => handlers.onPeerCount(count());

  return {
    leave: () => void room.leave(),
    broadcast: (log) => void action.send(wireEnvelope(log)),
  };
}

export function usePeers(store: TournamentStore): PeerState {
  const [status, setStatus] = useState<PeerStatus>("off");
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const session = useRef<Session | null>(null);
  // Read through a ref so the room's callbacks always see the current log
  // without the session being torn down and rebuilt on every score.
  const logRef = useRef<EventLog>(store.log);
  logRef.current = store.log;

  const absorb = store.absorb;
  const writeKey = store.writeKey;

  const start = useCallback(() => {
    if (session.current) return;

    // A watch link holds no key, so it cannot derive the room and could not be
    // admitted to it. Saying so is better than a button that spins and fails.
    if (!writeKey) {
      setStatus("unavailable");
      setError(
        "This is a watch link, so it cannot follow along live. Ask the organiser for an organiser link.",
      );
      return;
    }

    setStatus("connecting");
    setError(null);

    roomIdFor(writeKey)
      .then((roomId) =>
        openSession(roomId, {
          readLog: () => logRef.current,
          password: writeKey,
          onIncoming: (incoming) => absorb(mergeLogs([], incoming)),
          onPeerCount: setCount,
          onError: (message) => {
            setStatus("unavailable");
            setError(message);
          },
        }),
      )
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
  }, [writeKey, absorb]);

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
