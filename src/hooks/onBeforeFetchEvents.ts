import host from '@plugin-host';
import { generateMonthIndex } from '../crypto/encrypt.ts';
import { CalendarCryptoError, getKeys } from '../crypto/getKey.ts';
import type { CalendarEventFilter, CalendarEventFilterCondition } from '../types.ts';
import { getCurrentAccountId, monthsBetween, notifyThrottled } from '../util.ts';

/**
 * Filtres en clair qui, une fois les données chiffrées, ne peuvent plus être évalués par le
 * serveur — et qui, envoyés tels quels, FERAIENT FUITER les termes recherchés. On les retire :
 * la recherche plein texte doit se faire côté client sur les événements déchiffrés.
 */
const CLIENT_SIDE_ONLY: (keyof CalendarEventFilterCondition)[] = ['text', 'title', 'description', 'location', 'attendee'];

export async function onBeforeFetchEvents(filter: CalendarEventFilter): Promise<CalendarEventFilter> {
  const accountId = await getCurrentAccountId();
  if (!accountId) return filter;

  try {
    const keys = await getKeys(accountId);
    return await editFilter(filter, keys.dekHmac);
  } catch (e) {
    // Pas de clé (jamais chiffré) → filtre inchangé pour continuer à voir les événements legacy.
    if (!(e instanceof CalendarCryptoError && e.code === 'NO_KEYS')) {
      host.log.error('Cannot rewrite the calendar filter:', e);
      notifyThrottled(host.i18n.t('calendar.error.locked'));
    }
    return filter;
  }
}

async function editFilter(filter: CalendarEventFilter, hmacKey: CryptoKey): Promise<CalendarEventFilter> {
  if ('operator' in filter) {
    return { ...filter, conditions: await Promise.all(filter.conditions.map((f) => editFilter(f, hmacKey))) };
  }

  const { after, before, ...rest } = filter;
  const cleaned: CalendarEventFilterCondition = { ...rest };
  for (const f of CLIENT_SIDE_ONLY) delete cleaned[f];

  if (!after && !before) return cleaned;

  if (!after || !before) {
    // Une borne seule n'a aucun sens contre des dates factices : on retire les deux.
    host.log.warn('Open-ended date filter cannot be evaluated server-side; returning all events.');
    return cleaned;
  }

  const months = monthsBetween(new Date(after), new Date(before));
  if (months.length === 0) return cleaned;

  const monthConditions: CalendarEventFilterCondition[] = await Promise.all(
    months.map(async (m) => ({ ...cleaned, title: await generateMonthIndex(m, hmacKey) }))
  );
  return monthConditions.length === 1 ? monthConditions[0] : { operator: 'OR', conditions: monthConditions };
}
