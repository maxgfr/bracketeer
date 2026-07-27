/**
 * Public and private data.
 *
 * With no server there is no login, so "private" cannot mean permission. It has
 * to mean *absence*: the honest way to keep a phone number out of a spectator's
 * hands is to not put it in the link they are given.
 *
 * So there are two links.
 *
 *   · The watch link carries the tournament with every private field stripped
 *     out, and no organiser key. The data is not hidden in it — it is not in it.
 *   · The run link carries everything, plus the key that lets a device push
 *     changes over live sync.
 *
 * What this does *not* claim: somebody holding a watch link can still edit their
 * own copy on their own device. Nothing without a server can stop that, and it
 * changes nothing for anybody else, because their changes are refused by every
 * peer that does not see the key.
 */

import type { EntrantId, EventLog, TournamentConfig } from "@bracketeer/engine";

/** Fields the organiser has marked as theirs alone. */
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

/** True when anything would actually be removed, so the UI can say so honestly. */
export function hasPrivateValues(
  log: EventLog,
  privateKeys: readonly string[],
): boolean {
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
