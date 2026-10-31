import type { CalendarEvent } from '../types.ts';

/** Fields moved into the encrypted payload (stored in `description`). */
export const SENSITIVE_FIELDS = [
  'title',
  'description',
  'utcStart',
  'utcEnd',
  'start',
  'duration',
  'timeZone',
  'keywords',
  'categories',
  'locale',
  'replyTo',
  'organizerCalendarAddress',
  'participants',
  'locations',
  'virtualLocations',
  'links',
  'relatedTo',
] as const satisfies readonly (keyof CalendarEvent)[];

export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

/**
 * Neutral values sent in clear to the server instead of the real ones.
 * `start` is not listed here: it is derived per event with `publicStart()`.
 */
export const PUBLIC_PLACEHOLDER = {
  title: 'Encrypted',
  utcStart: null,
  utcEnd: null,
  duration: 'PT1H',
  timeZone: 'UTC',
  keywords: null,
  categories: null,
  locale: null,
  replyTo: null,
  organizerCalendarAddress: null,
  participants: null,
  locations: null,
  virtualLocations: null,
  links: null,
  relatedTo: null,
} satisfies Partial<CalendarEvent>;

/**
 * Public (server-visible) start: the first day of the event's month, as a JSCalendar
 * LocalDateTime (no "Z", no milliseconds). Only the month leaks; the real start lives in
 * the encrypted payload and must never be truncated.
 *
 * The month is read straight from the string on purpose: going through `Date` would
 * apply the browser's timezone and could shift the month.
 */
export function publicStart(start: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(start ?? '');
  return m ? `${m[1]}-${m[2]}-01T00:00:00` : '1970-01-01T00:00:00';
}

export function pickSensitive(event: Partial<CalendarEvent>): Record<SensitiveField, unknown> {
  const out = {} as Record<SensitiveField, unknown>;
  for (const f of SENSITIVE_FIELDS) out[f] = event[f] ?? null;
  return out;
}

export function isEncryptedEvent(event: Partial<CalendarEvent>): boolean {
  return event.title === 'Encrypted';
}