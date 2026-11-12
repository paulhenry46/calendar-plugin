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

/**
 * Decrypts the payload stored in `description`, or returns null when it is not an encrypted
 * payload (legacy plain event). A semi-encrypted event (alerts) is not recognisable by its
 * title, so the only reliable test is to try to decrypt it.
 */
async function tryDecryptPayload(
  description: string,
  aesKey: CryptoKey
): Promise<Partial<CalendarEvent> | null> {
  try {
    return JSON.parse(await decryptString(description, aesKey));
  } catch {
    return null;
  }
}

export async function onUpdatingEvent(data: {localUpdates: Partial<CalendarEvent>, serverUpdates: Partial<CalendarEvent>, eventId: string}): Promise<{localUpdates: Partial<CalendarEvent>, serverUpdates: Partial<CalendarEvent>, eventId: string}> {
  let patch = data.localUpdates;

  // A recurrence rule is being added/changed by this update.
  const hasRecurrence = !!patch.recurrenceRules?.length;
  // Alerts are being added, edited or removed: the encryption mode may have to change.
  const touchesAlerts = 'alerts' in patch;

  if (!hasRecurrence && !touchesAlerts && !SENSITIVE_FIELDS.some((f) => f in patch)) {
    return { localUpdates: patch, serverUpdates: patch, eventId: data.eventId };
  }

  const existing: CalendarEvent = await host.calendar.getEvent(data.eventId);
  console.log('exisitng', existing);
  const accountId = await resolveAccountId(existing.accountId);
  // Fully encrypted (title = placeholder). A semi-encrypted event is NOT detected here.
  const alreadyEncrypted = isEncryptedEvent(existing);

  // Editing a legacy (plain) event is a write path: allow creating the keys, like on create.
  // For an already encrypted event, never generate keys: they must already exist.
  const keys = await getKeys(accountId, { createIfMissing: !alreadyEncrypted });

  let currentPayload: Partial<CalendarEvent> = {};
  if (alreadyEncrypted) {
    try {
      currentPayload = JSON.parse(await decryptString(existing.description, keys.dekAes));
    } catch (error) {
      throw new Error('Failed to decrypt the existing event payload, update aborted: ' + error);
    }
  } else {
    // Semi-encrypted (alerts) event: real title/time in clear + encrypted payload.
    // Legacy plain event: no payload.
    currentPayload = (await tryDecryptPayload(existing.description, keys.dekAes)) ?? {};
  }

  // Real values only: the payload is never truncated or altered.
  let merged: CalendarEvent = { ...existing, ...currentPayload, ...patch };

  // Target mode: semi-encrypted as long as the event has at least one alert after this update,
  // fully encrypted otherwise (last alert removed).
  const wantClear = hasAlerts(merged);

  // Fully encrypted -> semi-encrypted exposes the title and the time: ask first.
  // Also warn when a recurrence is added to an event with alerts (occurrences get none).
  // Done BEFORE creating any occurrence, so a refusal leaves nothing behind.
  if (wantClear && (alreadyEncrypted || hasRecurrence)) {
    if (!(await confirmClearForAlerts(hasRecurrence))) {
      throw new Error('Event update cancelled by the user (alerts require clear title and time).');
    }
  }

  if (hasRecurrence) {
    const created = await createRecurrenceOccurrences(merged);
    console.log(`Récurrence: ${created} occurrence`);
    patch = stripRecurrence(patch);
    merged = stripRecurrence(merged);
  }

  const description = await encryptString(JSON.stringify(pickSensitive(merged)), keys.dekAes);

  // Public copy: sensitive fields removed from the patch, then the placeholders of the target
  // mode are applied on every update (idempotent). This is what switches the event between
  // semi-encrypted and fully encrypted on the server.
  const updated: Partial<CalendarEvent> = { ...patch };
  for (const f of SENSITIVE_FIELDS) delete updated[f];
  Object.assign(updated, placeholderFor(wantClear));

  if (wantClear) {
    // Alerts need the real title, date and time on the server (start is not truncated either).
    for (const f of CLEAR_WHEN_ALERTS) (updated as Record<string, unknown>)[f] = merged[f];
    Object.assign(updated, { start: merged.start, description });
  } else {
    // The public start always follows the merged start, so moving an event to another
    // month moves it on the server too.
    Object.assign(updated, { start: publicStart(merged.start), description });
    delete updated.utcStart;
    delete updated.utcEnd;
  }

  console.log('onUpdatingEvent Finished', { localUpdates: patch, serverUpdates: updated, eventId: data.eventId });
  return { localUpdates: patch, serverUpdates: updated, eventId: data.eventId };
}