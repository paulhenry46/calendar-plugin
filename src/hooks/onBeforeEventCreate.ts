import { encryptString } from '../crypto/encrypt.ts';
import { getKeys } from '../crypto/getKey.ts';
import type { CalendarEvent } from '../types.ts';
import { resolveAccountId } from '../util.ts';
import { pickSensitive, PUBLIC_PLACEHOLDER, publicStart } from './payload.ts';

export async function encryptCalendarEvent(
  event: CalendarEvent,
  aesKey: CryptoKey
): Promise<CalendarEvent> {
  // The payload is built from the untouched event: real dates are encrypted as-is.
  const description = await encryptString(JSON.stringify(pickSensitive(event)), aesKey);
  // Only the public copy gets the month-truncated start.
  return { ...event, ...PUBLIC_PLACEHOLDER, start: publicStart(event.start), description };
}

export async function onBeforeEventCreate(event: CalendarEvent): Promise<CalendarEvent> {
  const accountId = await resolveAccountId(event.accountId);
  const keys = await getKeys(accountId, { createIfMissing: true });
  return encryptCalendarEvent(event, keys.dekAes);
}