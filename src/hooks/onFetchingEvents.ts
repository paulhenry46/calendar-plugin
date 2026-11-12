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
  console.log("decrypting event", encryptedEvent)
  if (!isEncryptedEvent(encryptedEvent)) return encryptedEvent;
  console.log('bien chiffré a priori')
  const payload = JSON.parse(await decryptString(encryptedEvent.description, aesKey));
  console.log(payload);
  const restored: Partial<CalendarEvent> = {};
  const emptyDescription = !payload.description || (typeof payload.description === 'string' && payload.description.trim() === '');
  // Whitelist: the payload can never overwrite id, accountId, etc.
  for (const field of SENSITIVE_FIELDS) {
    if (field in payload) (restored as Record<string, unknown>)[field] = payload[field];
  }
  if(emptyDescription){
    // we do that because if there is no description, the description is used by the encrypted data and user see it instead of nothing
    encryptedEvent.description = '';
  }
  console.log('final event dechiffré', { ...encryptedEvent, ...restored });
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
  let removeWhenError = host.plugin?.settings?.removeWhenError;
  if (removeWhenError === undefined) {
    removeWhenError = true; // default to removing events that cannot be decrypted
  }
  if (!events || events.length === 0) return [];

  const currentAccountId = await getCurrentAccountId();
  console.log('here is the current account id:', currentAccountId);
  const keysByAccount = new Map<string, Promise<CalendarKeys | null>>();
  const notifiedAccounts = new Set<string>(); // avoid spamming the user with multiple modals for the same account in one fetch

  const keysFor = (accountId: string) => {
    let p = keysByAccount.get(accountId);
    if (!p) {
      const recentlyFailed =
         Date.now() - (lastFailureAt.get(accountId) ?? 0) < FAILURE_TTL_MS;
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
  const results = await Promise.all(
  events.map(async (event) => {
    if (!isEncryptedEvent(event)) return event; // legacy / already plain
    const accountId = event.accountName + '@' + serverID || currentAccountId;
    console.log('Decrypting event with accountId:', accountId, 'event:', event);
    if (!accountId) return event;

    const keys = await keysFor(accountId);
    if (!keys) {
      if (!notifiedAccounts.has(accountId)) {
        notifiedAccounts.add(accountId);
        await host.ui.confirm({
          title: host.i18n.t('no_keys.title'),
          message: host.i18n.t('no_keys.message') + event.accountName,
        });
      }
      
      return removeWhenError ? null : event;
    }

    try {
      return await decryptCalendarEvent(event, keys.dekAes);
    } catch (e) {
      console.log(event)
      host.log.warn(`Could not decrypt event ${event.id}:`, e);
      
      return removeWhenError ? null : event;
    }
  })
);
console.log(results);
return results.filter((event) => event !== null);

}
