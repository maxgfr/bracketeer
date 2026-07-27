/**
 * The store.
 *
 * One log in, one state out. Everything the interface does is `dispatch(event)`,
 * which appends to the log, persists it, and lets replay produce the new state.
 * There is no second source of truth to fall out of step, and no mutation for a
 * peer's arriving events to conflict with.
 */

import {
  computeRatings,
  mergeLogs,
  ratingValues,
  replay,
  undoLast,
  appendEvent,
  type DomainEvent,
  type EventLog,
  type TournamentState,
} from "@bracketeer/engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  actorId,
  loadLog,
  rememberWriteKey,
  saveLog,
  storedWriteKey,
  writeKeyFor,
} from "./storage.js";

export interface TournamentStore {
  id: string;
  /**
   * The secret that lets a device push changes over live sync. It travels only
   * in an organiser link, so a watch link can read what arrives and cannot send
   * anything anybody else will accept.
   */
  writeKey: string;
  /** False when this device opened a watch link: it can look, not push. */
  canPush: boolean;
  log: EventLog;
  state: TournamentState;
  ratings: Map<string, number>;
  /** Append events and persist. */
  dispatch: (events: DomainEvent | DomainEvent[]) => void;
  /** Merge a log arriving from a peer or a file. */
  absorb: (incoming: EventLog) => void;
  /** Replace the log wholesale, as an import does. */
  replace: (log: EventLog) => void;
  undo: () => void;
  canUndo: boolean;
  /** False when the browser refused to persist — private mode, or a full quota. */
  persisted: boolean;
  actor: string;
}

export function useTournament(
  id: string,
  fromLink?: EventLog,
  /** The key from the address, when the link carried one. */
  keyFromLink?: string,
): TournamentStore {
  const actor = useMemo(() => actorId(), []);

  /**
   * The key this device holds. An organiser link hands one over, and it is kept
   * so the device stays an organiser on the next visit. Otherwise: whoever made
   * the tournament here already has one, and anybody else has none.
   */
  /**
   * Who is holding this.
   *
   *   · Arrived by watch link — carries the tournament, no key: read-only.
   *   · Arrived by organiser link — carries a key: keep it, and push.
   *   · Opened it directly — it is on this device because you made it or
   *     imported it, so it is yours.
   *
   * The middle case is why the key is remembered: the next visit has no key in
   * the address, and demoting a helper to a spectator overnight would be worse
   * than useless.
   */
  const { writeKey, canPush } = useMemo(() => {
    if (keyFromLink) {
      rememberWriteKey(id, keyFromLink);
      return { writeKey: keyFromLink, canPush: true };
    }

    const held = storedWriteKey(id);
    if (held) return { writeKey: held, canPush: true };

    // A link that carried the tournament but no key is somebody watching.
    if (fromLink && fromLink.length > 0) return { writeKey: "", canPush: false };

    return { writeKey: writeKeyFor(id), canPush: true };
  }, [id, keyFromLink, fromLink]);

  /**
   * A link and a local copy are merged, never one chosen over the other.
   *
   * Taking the link's word for it loses work: two people running the same
   * tournament from the same link, one enters three scores, then re-opens the
   * link somebody pasted in a chat an hour ago — and their scores are gone.
   * Taking the local copy's word is the mirror of the same mistake.
   *
   * Merging is always safe here. The log is an append-only set of immutable
   * events with a total order, so the union is exactly what both devices should
   * have, and no event can be lost by it.
   */
  const [log, setLog] = useState<EventLog>(() =>
    mergeLogs(loadLog(id) ?? [], fromLink ?? []),
  );
  const [persisted, setPersisted] = useState(true);

  const state = useMemo(() => replay(log), [log]);
  const ratings = useMemo(() => ratingValues(computeRatings(state)), [state]);

  // Persist whenever the log changes, including changes arriving from a peer.
  const lastSaved = useRef<EventLog | null>(null);
  useEffect(() => {
    if (log.length === 0 || lastSaved.current === log) return;
    lastSaved.current = log;
    const ok = saveLog(id, log, {
      name: state.name || "Untitled",
      entrants: state.entrants.length,
    });
    setPersisted(ok);
  }, [id, log, state.name, state.entrants.length]);

  const dispatch = useCallback(
    (events: DomainEvent | DomainEvent[]) => {
      const list = Array.isArray(events) ? events : [events];
      if (list.length === 0) return;
      setLog((current) => {
        let next = current;
        for (const event of list) next = appendEvent(next, actor, event, Date.now());
        return next;
      });
    },
    [actor],
  );

  const absorb = useCallback((incoming: EventLog) => {
    setLog((current) => {
      const merged = mergeLogs(current, incoming);
      // Nothing new: keep the existing array so React skips the re-render.
      return merged.length === current.length ? current : merged;
    });
  }, []);

  const replace = useCallback((next: EventLog) => setLog(next), []);

  const undo = useCallback(() => {
    setLog((current) => undoLast(current, actor));
  }, [actor]);

  const canUndo = useMemo(() => log.some((e) => e.actor === actor), [log, actor]);

  return {
    id,
    writeKey,
    // Holding the key, or having made this tournament here, is what allows it.
    canPush,
    log,
    state,
    ratings,
    dispatch,
    absorb,
    replace,
    undo,
    canUndo,
    persisted,
    actor,
  };
}
