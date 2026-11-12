import host from '@plugin-host';
import type { CalendarEvent } from './types.ts';

export const MAX_MONTHS = 240;
const DAY_MS = 86_400_000;

export async function getCurrentAccountId(): Promise<string | undefined> {
  const accounts = await host.user.getAccounts();
  console.log('Retrieved accounts:', accounts);
  const current = accounts.find((a) => a.isActive);
  if (!current) {
    host.log.warn('No active account found.');
  }
  return current?.id;
}

/** Retourne `accountId` s'il est fourni, sinon le compte actif. Lève si aucun compte. */
export async function resolveAccountId(accountId?: string | null): Promise<string> {
  const id = accountId || (await getCurrentAccountId());
  if (!id) throw new Error('No account available to select the encryption keys.');
  return id;
}

/** Marge d'un jour utilisée à l'indexation (décalages de fuseau). */
export const INDEX_PAD_MS = DAY_MS;


/** Évite de spammer l'utilisateur : un même message au plus une fois par `everyMs`. */
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
  //serach in uid if there is 'half-encrypted-' string please
  return event.title === 'Encrypted' || event.uid?.includes('half-encrypted-') === true;
}

// We use the active accoutns server name to deduce the server name and construt an account ID.
export async function getServerID(){
  const accountId = await getCurrentAccountId();
  if (!accountId) {
    throw new Error('No account available to select the encryption keys.');
  }

return  accountId.substring(accountId.lastIndexOf('@') + 1);
}

export function generateUUID(): string {// from bulwark utils.ts file
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: construct a v4 UUID from crypto.getRandomValues
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}