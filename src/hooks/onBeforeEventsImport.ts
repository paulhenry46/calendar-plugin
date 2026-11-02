import { getKeys } from '../crypto/getKey.ts';
import type { CalendarEvent } from '../types.ts';
import { resolveAccountId } from '../util.ts';
import { encryptCalendarEvent } from './onCreatingEvent.ts';

export async function onBeforeImportEvent(params: {
  partialEvents: Partial<CalendarEvent>[];
  accountId: string;
}): Promise<Partial<CalendarEvent>[]> {
  const { partialEvents } = params;
  if (!partialEvents || partialEvents.length === 0) return [];

  const accountId = await resolveAccountId(params.accountId);
  const keys = await getKeys(accountId, { createIfMissing: true });

  return Promise.all(partialEvents.map((event) => encryptCalendarEvent(event, keys.dekAes)));
}