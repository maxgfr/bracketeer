/**
 * Public and private data.
 *
 * With no server there is no login, so "private" cannot mean permission. It has
 * to mean *absence*: the honest way to keep a phone number out of a spectator's
 * hands is to not put it in the copy they are given.
 *
 * So everything that leaves a device leaves for an audience.
 *
 *   · A `watch` copy carries the tournament with every private field stripped
 *     out, and no organiser key. The data is not hidden in it — it is not in it.
 *   · A `run` copy carries everything, and its holder can enter scores.
 *
 * This lives in the engine rather than in the app because the app is not the
 * only thing that shares. A second implementation is a second thing to forget
 * to update, and the failure mode is a phone number in a link.
 *
 * What this does *not* claim: somebody holding a watch copy can still edit it on
 * their own device. Nothing without a server can stop that, and it changes
 * nothing for anybody else, because their events never reach another peer.
 */

import { toBase64Url } from "../codec/index.js";
import type { TournamentConfig } from "../domain/config.js";
import type { EntrantId } from "../domain/entities.js";
import type { EventLog } from "../events/types.js";

/** Who a copy of the tournament is being made for. */
export type Audience = "watch" | "run";

/** Fields the organiser has chosen to publish. Everything else stays here. */
export function privateFieldKeys(config: TournamentConfig): string[] {
  return config.entrantFields.filter((field) => field.private).map((field) => field.key);
}

/**
 * A log with private values removed.
 *
 * Works on the events rather than the replayed state, because the log is what
 * travels — redacting the state and re-deriving a log would leave the originals
 * sitting in the events.
 */
export function redactPrivate(log: EventLog, privateKeys: readonly string[]): EventLog {
  if (privateKeys.length === 0) return log;
  const secret = new Set(privateKeys);

  const cleanMeta = (meta: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(meta)) {
      if (!secret.has(key)) out[key] = value;
    }
    return out;
  };

  return log.map((envelope) => {
    const event = envelope.event;

    if (event.type === "entrant_added") {
      return {
        ...envelope,
        event: { ...event, entrant: { ...event.entrant, meta: cleanMeta(event.entrant.meta) } },
      };
    }

    if (event.type === "entrant_updated" && event.patch.meta) {
      return {
        ...envelope,
        event: { ...event, patch: { ...event.patch, meta: cleanMeta(event.patch.meta) } },
      };
    }

    // The field *definitions* go too. Leaving them would give the public copy an
    // empty column for every entrant and quietly announce that you collect
    // phone numbers, which is most of what was meant to stay private.
    if (event.type === "tournament_created" || event.type === "config_replaced") {
      const config = event.config as { entrantFields?: { key: string }[] } | undefined;
      if (!config?.entrantFields) return envelope;
      return {
        ...envelope,
        event: {
          ...event,
          config: {
            ...config,
            entrantFields: config.entrantFields.filter((field) => !secret.has(field.key)),
          },
        },
      } as typeof envelope;
    }

    return envelope;
  });
}

/**
 * The log as this audience is allowed to see it.
 *
 * Every share path goes through here — the link, the embed, the file, the sync
 * wire — so there is one answer to "what does a spectator get" rather than one
 * per caller.
 */
export function logFor(log: EventLog, config: TournamentConfig, audience: Audience): EventLog {
  if (audience === "run") return log;
  return redactPrivate(log, privateFieldKeys(config));
}

/** True when anything would actually be removed, so the UI can say so honestly. */
export function hasPrivateValues(log: EventLog, privateKeys: readonly string[]): boolean {
  if (privateKeys.length === 0) return false;
  const secret = new Set(privateKeys);

  return log.some((envelope) => {
    const event = envelope.event;
    const meta =
      event.type === "entrant_added"
        ? event.entrant.meta
        : event.type === "entrant_updated"
          ? event.patch.meta
          : undefined;
    return meta ? Object.keys(meta).some((key) => secret.has(key) && meta[key]) : false;
  });
}

/** Entrants whose private values are set, for a count in the interface. */
export function entrantsWithPrivateData(
  log: EventLog,
  privateKeys: readonly string[],
): EntrantId[] {
  const secret = new Set(privateKeys);
  const found = new Set<EntrantId>();

  for (const { event } of log) {
    if (event.type === "entrant_added") {
      if (Object.keys(event.entrant.meta).some((k) => secret.has(k) && event.entrant.meta[k])) {
        found.add(event.entrant.id);
      }
    } else if (event.type === "entrant_updated" && event.patch.meta) {
      const meta = event.patch.meta;
      if (Object.keys(meta).some((k) => secret.has(k) && meta[k])) found.add(event.id);
    }
  }

  return [...found];
}

/**
 * The live-sync room for a tournament, derived from the organiser key.
 *
 * It must not be derived from the tournament id: the id travels in every link
 * including the watch one, so a room named after it is a room every spectator
 * can walk into and read unredacted events off. Deriving it from the secret
 * instead means finding the room already requires holding the organiser link,
 * which is exactly the set of people allowed in.
 *
 * The hash is one-way, so the room name does not hand the key back out.
 */
export async function roomIdFor(writeKey: string): Promise<string> {
  const bytes = new TextEncoder().encode(`bracketeer:room:${writeKey}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toBase64Url(new Uint8Array(digest));
}
