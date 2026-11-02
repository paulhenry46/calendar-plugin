import { isUnlockedLocally } from '../crypto/broadcastChannel.ts';
import { decryptString } from '../crypto/encrypt.ts';
import { CalendarCryptoError, getKeys, type CalendarKeys } from '../crypto/getKey.ts';
import type { CalendarEvent } from '../types.ts';
import { getCurrentAccountId, getServerID, notifyThrottled } from '../util.ts';
import host from '@plugin-host';
import { isEncryptedEvent, SENSITIVE_FIELDS } from '../util.ts';

/** After a failed key load, do not retry for this long (each attempt can block for ~2 s). */
const FAILURE_TTL_MS = 5_000;
const lastFailureAt = new Map<string, number>();

export async function decryptCalendarEvent(
  encryptedEvent: CalendarEvent,
  aesKey: CryptoKey
): Promise<CalendarEvent> {
  if (!isEncryptedEvent(encryptedEvent)) return encryptedEvent;

  const payload = JSON.parse(await decryptString(encryptedEvent.description, aesKey));
  const restored: Partial<CalendarEvent> = {};
  // Whitelist: the payload can never overwrite id, accountId, etc.
  for (const field of SENSITIVE_FIELDS) {
    if (field in payload) (restored as Record<string, unknown>)[field] = payload[field];
  }
  return { ...encryptedEvent, ...restored };
}

/**
 * Read path: fail open (return events as-is) so the calendar does not break when the master
 * plugin is locked or when an event is not encrypted (created before the plugin was
 * installed). An encrypted event that cannot be decrypted is returned with its public
 * placeholders (title "Encrypted", 1st of its month).
 *
 */
export async function onFetchingEvents(events: CalendarEvent[]): Promise<CalendarEvent[]> {
  if (!events || events.length === 0) return [];

  const currentAccountId = await getCurrentAccountId();
  console.log('here is the current account id:', currentAccountId);
  const keysByAccount = new Map<string, Promise<CalendarKeys | null>>();

  const keysFor = (accountId: string) => {
    let p = keysByAccount.get(accountId);
    if (!p) {
      const recentlyFailed =
        !isUnlockedLocally(accountId) && Date.now() - (lastFailureAt.get(accountId) ?? 0) < FAILURE_TTL_MS;
      p = recentlyFailed
        ? Promise.resolve(null)
        : getKeys(accountId).catch((e) => {
            lastFailureAt.set(accountId, Date.now());
            if (e instanceof CalendarCryptoError && e.code === 'NO_KEYS') return null; // nothing was ever encrypted
            host.log.error('Calendar decryption unavailable:', e);
            notifyThrottled(host.i18n.t(`calendar.error.${e instanceof CalendarCryptoError ? e.code : 'UNKNOWN'}`));
            return null;
          });
      keysByAccount.set(accountId, p);
    }
    return p;
  };
  const serverID = await getServerID();
  return Promise.all(
    events.map(async (event) => {
      if (!isEncryptedEvent(event)) return event; // legacy / already plain
      const accountId = event.accountName + '@' + serverID || currentAccountId;
      console.log('Decrypting event with accountId:', accountId, 'event:', event);
      if (!accountId) return event;
      const keys = await keysFor(accountId);
      if (!keys) return event;
      try {
        return await decryptCalendarEvent(event, keys.dekAes);
      } catch (e) {
        // Wrong key or tampered data (GCM authenticates): never render anything invented.
        host.log.warn(`Could not decrypt event ${event.id}:`, e);
        return event;
      }
    })
  );
}
