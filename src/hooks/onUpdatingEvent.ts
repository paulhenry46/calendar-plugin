import host from '@plugin-host';
import { decryptString, encryptString } from '../crypto/encrypt.ts';
import { getKeys } from '../crypto/getKey.ts';
import type { CalendarEvent } from '../types.ts';
import { resolveAccountId } from '../util.ts';
import {
  isEncryptedEvent,
  pickSensitive,
  publicStart,
  SENSITIVE_FIELDS,
} from '../util.ts';
import { createRecurrenceOccurrences, stripRecurrence } from '../expand.ts';
import {
  CLEAR_WHEN_ALERTS,
  confirmClearForAlerts,
  hasAlerts,
  placeholderFor,
} from './onCreatingEvent.ts';

export async function onUpdatingEvent(data: {localUpdates: Partial<CalendarEvent>, serverUpdates: Partial<CalendarEvent>, eventId: string}): Promise<{localUpdates: Partial<CalendarEvent>, serverUpdates: Partial<CalendarEvent>, eventId: string}> {
  console.log('--- [onUpdatingEvent] Début ---', { eventId: data.eventId, localUpdates: data.localUpdates });
  
  let patch = data.localUpdates;

  const hasRecurrence = !!patch.recurrenceRules?.length;
  const touchesAlerts = 'alerts' in patch;

  if (!hasRecurrence && !touchesAlerts && !SENSITIVE_FIELDS.some((f) => f in patch)) {
    console.log('--- [onUpdatingEvent] Aucun champ sensible, récurrence ou alerte modifié. Passage direct. ---');
    return { localUpdates: patch, serverUpdates: patch, eventId: data.eventId };
  }

  const existing: CalendarEvent = await host.calendar.getEvent(data.eventId);
  console.log('--- [onUpdatingEvent] Événement existant récupéré ---', existing);

  const accountId = await resolveAccountId(existing.accountId);
  const alreadyEncrypted = false;

  const keys = await getKeys(accountId, { createIfMissing: !alreadyEncrypted });
  console.log('--- [onUpdatingEvent] Clés récupérées avec succès ---');

  let currentPayload: Partial<CalendarEvent> = {};
  if (alreadyEncrypted) {
    try {
      const decryptedString = await decryptString(existing.description, keys.dekAes);
      currentPayload = JSON.parse(decryptedString);
      console.log('--- [onUpdatingEvent] Payload décrypté avec succès ---', currentPayload);
    } catch (error) {
      console.error('--- [onUpdatingEvent] ERREUR DE DÉCRYPTAGE ---', error);
      throw new Error('Failed to decrypt the existing event payload, update aborted: ' + error);
    }
  }

  let merged: CalendarEvent = { ...existing, ...currentPayload, ...patch };

  const wantClear = hasAlerts(merged);

  if (wantClear && (alreadyEncrypted || hasRecurrence)) {
    if (!(await confirmClearForAlerts(hasRecurrence))) {
      throw new Error('Event update cancelled by the user (alerts require clear title and time).');
    }
  }

  if (hasRecurrence) {
    const created = await createRecurrenceOccurrences(merged);
    patch = stripRecurrence(patch);
    merged = stripRecurrence(merged);
  }

  const encryptedDescription = await encryptString(JSON.stringify(pickSensitive(merged)), keys.dekAes);

  const updated: Partial<CalendarEvent> = { ...patch };
  for (const f of SENSITIVE_FIELDS) delete updated[f];
  Object.assign(updated, placeholderFor(wantClear));

  if (wantClear) {
    for (const f of CLEAR_WHEN_ALERTS) (updated as Record<string, unknown>)[f] = merged[f];
    Object.assign(updated, { start: merged.start, description: encryptedDescription });
  } else {
    Object.assign(updated, { start: publicStart(merged.start), description: encryptedDescription });
    delete updated.utcStart;
    delete updated.utcEnd;
  }

  console.log('--- [onUpdatingEvent] OK ---', { localUpdates: data.localUpdates, serverUpdates: updated, eventId: data.eventId });
  return { localUpdates: data.localUpdates, serverUpdates: updated, eventId: data.eventId };
}