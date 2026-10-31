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
  console.log('Encrypting event 23:', event);
  const description = await encryptString(JSON.stringify(pickSensitive(event)), aesKey);
  // Only the public copy gets the month-truncated start.
  const encryptedEvent = { ...event, ...PUBLIC_PLACEHOLDER, start: publicStart(event.start), description }
  console.log('Event after encryption, before returning:', encryptedEvent);
  return encryptedEvent;
}

export async function onBeforeEventCreate(event: CalendarEvent): Promise<CalendarEvent> {
  console.log('onBeforeEventCreate called with event:', event);
  const accountId = await resolveAccountId(event.accountId);
  const keys = await getKeys(accountId, { createIfMissing: true });
  console.log('Retrieved keys for account', accountId, keys);
  console.log('Encrypting event with AES key:', keys.dekAes);
  console.log('Event before encryption:', event);
  return encryptCalendarEvent(event, keys.dekAes);
}