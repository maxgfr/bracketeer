/**
 * Scheduling: putting fixtures on a clock and in a place.
 *
 * Two constraints drive everything. A competitor cannot be in two places at
 * once, and a venue can only host what it has room for. Rounds are laid out in
 * order, and within a round fixtures fill the available slots.
 */

import type { ScheduleConfig, Venue } from "../domain/config.js";
import type { EntrantId, Match, TournamentState } from "../domain/entities.js";
import type { DomainEvent } from "../events/types.js";

export interface ScheduledSlot {
  matchId: string;
  startsAt: string;
  venueId: string | null;
}

export interface ScheduleConflict {
  kind: "entrant_double_booked" | "venue_over_capacity";
  message: string;
  matchIds: string[];
}

function totalCapacity(venues: readonly Venue[]): number {
  return venues.reduce((sum, v) => sum + v.capacity, 0);
}

/** How many fixtures can run at once. */
function concurrency(config: ScheduleConfig): number {
  if (config.concurrentMatches && config.concurrentMatches > 0) return config.concurrentMatches;
  const capacity = totalCapacity(config.venues);
  return capacity > 0 ? capacity : 1;
}

/** Repeat each venue by its capacity, so assignment is a flat list of seats. */
function venueSeats(venues: readonly Venue[]): (string | null)[] {
  const seats: string[] = [];
  for (const venue of venues) {
    for (let i = 0; i < venue.capacity; i += 1) seats.push(venue.id);
  }
  return seats.length > 0 ? seats : [null];
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/**
 * Lay out a stage's fixtures.
 *
 * Fixtures are grouped by round and rounds run in order, because a knockout's
 * second round cannot start before its first has finished. Within a round,
 * fixtures are dealt into concurrent slots; when a round needs more slots than
 * exist, it spills into further waves and the round takes longer.
 */
export function planSchedule(
  matches: readonly Match[],
  config: ScheduleConfig,
  startsAt?: string | null,
): ScheduledSlot[] {
  const start = startsAt ?? config.startsAt;
  if (!start) return [];

  const perWave = Math.max(1, concurrency(config));
  const seats = venueSeats(config.venues);

  const byRound = new Map<number, Match[]>();
  for (const match of matches) {
    if (match.status === "bye" || match.status === "void") continue;
    const bucket = byRound.get(match.roundIndex) ?? [];
    bucket.push(match);
    byRound.set(match.roundIndex, bucket);
  }

  const slots: ScheduledSlot[] = [];
  let cursor = start;

  for (const roundIndex of [...byRound.keys()].sort((a, b) => a - b)) {
    const fixtures = (byRound.get(roundIndex) ?? []).slice().sort((a, b) => a.order - b.order);

    for (let offset = 0; offset < fixtures.length; offset += perWave) {
      const wave = fixtures.slice(offset, offset + perWave);
      wave.forEach((match, i) => {
        slots.push({
          matchId: match.id,
          startsAt: cursor,
          venueId: seats[i % seats.length] ?? null,
        });
      });
      cursor = addMinutes(cursor, config.matchDurationMinutes);
    }

    cursor = addMinutes(cursor, config.breakBetweenRoundsMinutes);
  }

  return slots;
}

/** Turn a plan into events the log can carry. */
export function scheduleEvents(slots: readonly ScheduledSlot[]): DomainEvent[] {
  return slots.map((slot) => ({
    type: "match_scheduled" as const,
    matchId: slot.matchId,
    scheduledAt: slot.startsAt,
    venueId: slot.venueId,
  }));
}

/**
 * Problems with the schedule as it currently stands.
 *
 * Reported rather than prevented: an organiser who deliberately double-books a
 * court knows something the engine does not, and should not be stopped.
 */
export function findConflicts(
  state: TournamentState,
  config: ScheduleConfig = state.config.schedule,
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const scheduled = state.matches.filter(
    (m) => m.scheduledAt !== null && m.status !== "void" && m.status !== "bye",
  );

  const byTime = new Map<string, Match[]>();
  for (const match of scheduled) {
    const bucket = byTime.get(match.scheduledAt as string) ?? [];
    bucket.push(match);
    byTime.set(match.scheduledAt as string, bucket);
  }

  for (const [time, fixtures] of byTime) {
    const seen = new Map<EntrantId, string>();
    for (const match of fixtures) {
      for (const side of match.sides) {
        if (!side.entrantId) continue;
        const previous = seen.get(side.entrantId);
        if (previous) {
          conflicts.push({
            kind: "entrant_double_booked",
            message: `${side.entrantId} is in two fixtures at ${time}`,
            matchIds: [previous, match.id],
          });
        } else {
          seen.set(side.entrantId, match.id);
        }
      }
    }

    const perVenue = new Map<string, string[]>();
    for (const match of fixtures) {
      if (!match.venueId) continue;
      const bucket = perVenue.get(match.venueId) ?? [];
      bucket.push(match.id);
      perVenue.set(match.venueId, bucket);
    }

    for (const [venueId, matchIds] of perVenue) {
      const capacity = config.venues.find((v) => v.id === venueId)?.capacity ?? 1;
      if (matchIds.length > capacity) {
        conflicts.push({
          kind: "venue_over_capacity",
          message: `${venueId} has ${matchIds.length} fixtures at ${time} but room for ${capacity}`,
          matchIds,
        });
      }
    }
  }

  return conflicts;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Calendar export
 * ──────────────────────────────────────────────────────────────────────────── */

function icsTimestamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape the characters iCalendar treats specially, and fold long lines. */
function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function fold(line: string): string[] {
  if (line.length <= 75) return [line];
  const out: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    out.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length > 0) out.push(` ${rest}`);
  return out;
}

/**
 * An iCalendar feed of the fixtures, so a season lands in whatever calendar
 * people already use rather than in a website they have to remember to check.
 */
export function toIcs(state: TournamentState, matches: readonly Match[] = state.matches): string {
  const nameOf = (id: string | null): string =>
    state.entrants.find((e) => e.id === id)?.name ?? "TBD";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bracketeer//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsText(state.name)}`,
  ];

  const duration = state.config.schedule.matchDurationMinutes;

  for (const match of matches) {
    if (!match.scheduledAt || match.status === "void") continue;

    const title = match.sides.map((s) => nameOf(s.entrantId)).join(" v ");
    const venue = state.config.schedule.venues.find((v) => v.id === match.venueId);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${match.id}@bracketeer`,
      `DTSTAMP:${icsTimestamp(state.createdAt || match.scheduledAt)}`,
      `DTSTART:${icsTimestamp(match.scheduledAt)}`,
      `DTEND:${icsTimestamp(addMinutes(match.scheduledAt, duration))}`,
      ...fold(`SUMMARY:${icsText(title)}`),
      ...fold(`DESCRIPTION:${icsText([state.name, match.label ?? ""].filter(Boolean).join(" — "))}`),
    );
    if (venue) lines.push(...fold(`LOCATION:${icsText(venue.name)}`));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  // iCalendar requires CRLF line endings.
  return `${lines.join("\r\n")}\r\n`;
}
