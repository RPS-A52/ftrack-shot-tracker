/**
 * Studio-time dates, ported from ftrack-timeline-viewer (src/model/dates.ts).
 *
 * A schedule is a calendar, not a clock: the same task must land on the same day for every
 * viewer, wherever they are sitting. ftrack sends genuine UTC instants, and what they mean is
 * not consistent between entities (a start date can be stored at studio midnight, or at 20:00
 * the previous studio day), so every instant is read in the studio's own timezone, per
 * instant, so daylight saving is handled rather than assumed.
 *
 * `toStudioDayFloor` answers "what was the date in the studio at that moment": what we display,
 * and what ftrack reports. `toStudioWallClock` re-expresses an instant so its UTC fields carry
 * the studio's clock reading, which lets the timeline's UTC axis behave as a studio-time axis.
 * Neither rounds: ftrack reports the date the clock actually read.
 */

/**
 * The studio's timezone. ftrack does not publish the workspace timezone through its API, so
 * it is configured at build time (VITE_STUDIO_TIME_ZONE) and validated: a typo would otherwise
 * silently fall back to the viewer's own zone and shift every bar for anyone travelling.
 */
function resolveStudioTimeZone(): string {
  const configured = import.meta.env.VITE_STUDIO_TIME_ZONE?.trim();
  if (!configured) return 'America/Los_Angeles';
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: configured });
    return configured;
  } catch {
    throw new Error(
      `VITE_STUDIO_TIME_ZONE is not a timezone this browser recognises: "${configured}". ` +
        'Use an IANA name such as America/Los_Angeles.',
    );
  }
}

export const STUDIO_TIME_ZONE = resolveStudioTimeZone();

/** A calendar date in studio time, formatted `YYYY-MM-DD`. */
export type CalendarDay = string;

const MS_PER_DAY = 86_400_000;

const studioParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDIO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const wallClockParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: STUDIO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Re-express an instant as the studio wall clock, carried on a UTC date.
 *
 * The timeline's axis is drawn in UTC. Handing it the raw instant puts every bar late by the
 * studio's offset (seven hours in Los Angeles, about a third of a day column). Shifting each
 * instant so its UTC fields hold the studio's local fields makes the UTC axis read as studio
 * time, and bars land where ftrack's own timeline puts them.
 */
export function toStudioWallClock(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;

  const parts = wallClockParts.formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const [year, month, day, hour, minute, second] = ['year', 'month', 'day', 'hour', 'minute', 'second'].map(get);
  if ([year, month, day, hour, minute, second].some(Number.isNaN)) return null;

  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

/** The studio calendar day an instant falls on, without rounding. */
export function toStudioDayFloor(value: string | null | undefined): CalendarDay | null {
  if (!value) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;

  const parts = studioParts.formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const day = `${get('year')}-${get('month')}-${get('day')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

/** Integer index for a calendar day, counted in days from the epoch. */
export function dayIndex(day: CalendarDay): number {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(year, month - 1, date) / MS_PER_DAY);
}

function isWeekend(index: number) {
  const weekday = new Date(index * MS_PER_DAY).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Working days from *start* up to but not including *end*, as ftrack counts them: a task from
 * Monday 23:00 to the following Saturday 23:00 is five working days.
 */
export function workingDaysExclusive(start: CalendarDay, end: CalendarDay): number {
  const from = dayIndex(start);
  const to = dayIndex(end);
  let count = 0;
  for (let index = from; index < to; index += 1) {
    if (!isWeekend(index)) count += 1;
  }
  return count;
}

/** `Aug 23, 2026 10:00 PM` in studio time, matching ftrack's task popover. */
export function formatLongDayTime(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return '';
  return instant
    .toLocaleString('en-US', {
      timeZone: STUDIO_TIME_ZONE,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    // en-US puts a comma between the year and the time; ftrack does not.
    .replace(/,\s(?=\d{1,2}:)/, ' ');
}

/** A short label for the studio timezone, e.g. "PDT", for the timeline footer. */
export function studioZoneLabel(at: Date = new Date()): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: STUDIO_TIME_ZONE, timeZoneName: 'short' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;
  return name ?? STUDIO_TIME_ZONE;
}
