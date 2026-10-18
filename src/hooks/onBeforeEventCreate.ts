import { encryptString } from '../crypto/encrypt.ts';
import { getKeys } from '../crypto/getKey.ts';
import type { CalendarEvent } from '../types.ts';
import { resolveAccountId } from '../util.ts';
import { computeMonthIndexTitle, pickSensitive, PUBLIC_PLACEHOLDER } from './payload.ts';

export async function encryptCalendarEvent(
  event: CalendarEvent,
  aesKey: CryptoKey,
  hmacIndexKey: CryptoKey
): Promise<CalendarEvent> {
  const title = await computeMonthIndexTitle(event, hmacIndexKey);
  const description = await encryptString(JSON.stringify(pickSensitive(event)), aesKey);
  return { ...event, ...PUBLIC_PLACEHOLDER, title, description };
}

/**
 * Chemin d'écriture : on échoue en mode fermé (exception) plutôt que de laisser partir
 * un événement en clair. C'est ici que les clés peuvent être créées au premier usage.
 */
export async function onBeforeEventCreate(event: CalendarEvent): Promise<CalendarEvent> {
  const accountId = await resolveAccountId(event.accountId);
  const keys = await getKeys(accountId, { createIfMissing: true });
  return encryptCalendarEvent(event, keys.dekAes, keys.dekHmac);
}