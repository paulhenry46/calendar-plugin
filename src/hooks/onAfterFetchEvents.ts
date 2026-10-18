import { decryptString } from '../crypto/encrypt.ts';
import { CalendarCryptoError, getKeys, type CalendarKeys } from '../crypto/getKey.ts';
import type { CalendarEvent } from '../types.ts';
import { getCurrentAccountId, notifyThrottled } from '../util.ts';
import host from '@plugin-host';
import { isEncryptedEvent, SENSITIVE_FIELDS } from './payload.ts';

export async function decryptCalendarEvent(
  encryptedEvent: CalendarEvent,
  aesKey: CryptoKey
): Promise<CalendarEvent> {
  if (!isEncryptedEvent(encryptedEvent)) return encryptedEvent;

  const payload = JSON.parse(await decryptString(encryptedEvent.description, aesKey));
  const restored: Partial<CalendarEvent> = {};
  // Liste blanche : le payload ne peut jamais écraser id, accountId, etc.
  for (const field of SENSITIVE_FIELDS) {
    if (field in payload) (restored as Record<string, unknown>)[field] = payload[field];
  }
  return { ...encryptedEvent, ...restored };
}

/**
 * Chemin de lecture : on échoue en mode ouvert (on rend les événements tels quels) pour ne
 * pas casser l'agenda quand le maître est verrouillé ou qu'un événement n'est pas chiffré
 * (créé avant l'installation du plugin). Les événements chiffrés non déchiffrés restent
 * simplement invisibles (début en 1970).
 */
export async function onAfterFetchEvent(events: CalendarEvent[]): Promise<CalendarEvent[]> {
  if (!events || events.length === 0) return [];

  const currentAccountId = await getCurrentAccountId();
  const keysByAccount = new Map<string, Promise<CalendarKeys | null>>();

  const keysFor = (accountId: string) => {
    let p = keysByAccount.get(accountId);
    if (!p) {
      p = getKeys(accountId).catch((e) => {
        if (e instanceof CalendarCryptoError && e.code === 'NO_KEYS') return null; // rien n'a jamais été chiffré
        host.log.error('Calendar decryption unavailable:', e);
        notifyThrottled(host.i18n.t('calendar.error.locked'));
        return null;
      });
      keysByAccount.set(accountId, p);
    }
    return p;
  };

  return Promise.all(
    events.map(async (event) => {
      if (!isEncryptedEvent(event)) return event; // legacy / déjà en clair
      const accountId = event.accountId || currentAccountId;
      if (!accountId) return event;
      const keys = await keysFor(accountId);
      if (!keys) return event;
      try {
        return await decryptCalendarEvent(event, keys.dekAes);
      } catch (e) {
        // Mauvaise clé ou donnée altérée (GCM authentifie) : on ne rend rien d'inventé.
        host.log.warn(`Could not decrypt event ${event.id}:`, e);
        return event;
      }
    })
  );
}
