/**
 * Suggested tournament names.
 *
 * A blank name field is a small stall at the worst moment — somebody is standing
 * in a car park with people waiting. The suggestions are deliberately generic:
 * naming a tournament after the sport is the organiser's business, not ours.
 */

const OCCASIONS = [
  "Spring",
  "Summer",
  "Autumn",
  "Winter",
  "New Year",
  "Midweek",
  "Friday Night",
  "Saturday",
  "Sunday",
  "Season",
  "Annual",
  "Club",
  "Members'",
  "Newcomers'",
  "Veterans'",
  "Charity",
  "Anniversary",
  "Opening",
  "Closing",
];

const KINDS = [
  "Open",
  "Cup",
  "Shield",
  "Trophy",
  "Classic",
  "Challenge",
  "Championship",
  "Invitational",
  "Meeting",
  "Series",
  "Masters",
  "Plate",
  "League",
  "Tournament",
];

function pick<T>(items: readonly T[]): T {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return items[(value[0] ?? 0) % items.length] as T;
}

/**
 * Make a name unique against ones already in use.
 *
 * Clubs run the same event every year and often twice a season, so a bare
 * "Spring Cup" collides quickly — and two tournaments with the same name in the
 * list is the sort of thing you only notice while looking for the wrong one.
 * The year distinguishes editions; a numbered suffix distinguishes within one.
 */
export function numberedName(base: string, taken: readonly string[] = []): string {
  const used = new Set(taken.map((name) => name.trim().toLowerCase()));
  const withYear = `${base} ${new Date().getFullYear()}`;

  if (!used.has(withYear.toLowerCase())) return withYear;

  for (let edition = 2; edition < 500; edition += 1) {
    const candidate = `${withYear} #${edition}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return withYear;
}

/**
 * A suggested name, year-stamped and unique against what is already here.
 *
 * `avoid` is whatever is currently in the field: pressing the button and getting
 * back what you already had reads as broken.
 */
export function suggestName(avoid?: string, taken: readonly string[] = []): string {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = numberedName(`${pick(OCCASIONS)} ${pick(KINDS)}`, taken);
    if (candidate !== avoid?.trim()) return candidate;
  }
  return numberedName(`${pick(OCCASIONS)} ${pick(KINDS)}`, taken);
}
