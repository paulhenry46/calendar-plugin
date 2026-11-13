import host from '@plugin-host';
import type { CalendarEvent } from './types.ts';

export const MAX_MONTHS = 240;
const DAY_MS = 86_400_000;

export async function getCurrentAccountId(): Promise<string | undefined> {
  const accounts = await host.user.getAccounts();
  const current = accounts.find((a) => a.isActive);
  if (!current) {
    host.log.warn('No active account found.');
  }
  return current?.id;
}

export async function resolveAccountId(accountId?: string | null): Promise<string> {
  const id = accountId || (await getCurrentAccountId());
  if (!id) throw new Error('No account available to select the encryption keys.');
  return id;
}

export const INDEX_PAD_MS = DAY_MS;


const lastNotified = new Map<string, number>();
export function notifyThrottled(message: string, everyMs = 15_000): void {
  const now = Date.now();
  if (now - (lastNotified.get(message) ?? 0) < everyMs) return;
  lastNotified.set(message, now);
  try {
    host.toast.error(message);
  } catch {
    /* ignore */
  }
}


/** Fields moved into the encrypted payload (stored in `description`). */
export const SENSITIVE_FIELDS = [
  'title',
  'description',
  'utcStart',
  'utcEnd',
  'start',
  'duration',
  'timeZone',
  'showWithoutTime',
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
  timeZone: null,
  showWithoutTime: false,
  keywords: {
  encrypted: true
},
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
  return event.title === 'Encrypted' || event.keywords?.encrypted === true;
}

// We use the active accoutns server name to deduce the server name and construt an account ID.
export async function getServerID(){
  const accountId = await getCurrentAccountId();
  if (!accountId) {
    throw new Error('No account available to select the encryption keys.');
  }

return  accountId.substring(accountId.lastIndexOf('@') + 1);
}