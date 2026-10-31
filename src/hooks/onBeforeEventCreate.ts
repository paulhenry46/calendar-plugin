import { encryptString } from '../crypto/encrypt.ts';
import { getKeys } from '../crypto/getKey.ts';
import type { CalendarEvent } from '../types.ts';
import { resolveAccountId } from '../util.ts';
import { pickSensitive, PUBLIC_PLACEHOLDER } from './payload.ts';

export async function encryptCalendarEvent(
  event: CalendarEvent,
  aesKey: CryptoKey
): Promise<CalendarEvent> {
  const modifiedEvent = { ...event };

  if (modifiedEvent.start) {
    const date = new Date(modifiedEvent.start);
    const adjustedDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0));
    modifiedEvent.start = adjustedDate.toISOString();
  }

  if (modifiedEvent.utcStart) {
    const date = new Date(modifiedEvent.utcStart);
    const adjustedDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0));
    modifiedEvent.utcStart = adjustedDate.toISOString();
  }

  const title = 'Encrypted';
  const description = await encryptString(JSON.stringify(pickSensitive(event)), aesKey);
  return { ...modifiedEvent, ...PUBLIC_PLACEHOLDER, title, description };
}

export async function onBeforeEventCreate(event: CalendarEvent): Promise<CalendarEvent> {
  const accountId = await resolveAccountId(event.accountId);
  const keys = await getKeys(accountId, { createIfMissing: true });
  return encryptCalendarEvent(event, keys.dekAes);
}