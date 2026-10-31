import type { CalendarEvent } from '../types.ts';

/** Champs déplacés dans le payload chiffré (stocké dans `description`). */
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

/** Valeurs "neutres" envoyées en clair au serveur à la place des vraies. */
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

export function pickSensitive(event: Partial<CalendarEvent>): Record<SensitiveField, unknown> {
  const out = {} as Record<SensitiveField, unknown>;
  for (const f of SENSITIVE_FIELDS) out[f] = event[f] ?? null;
  return out;
}

export function isEncryptedEvent(event: Partial<CalendarEvent>): boolean {
  return  event.title === 'Encrypted';
}
