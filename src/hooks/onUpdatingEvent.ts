import host from '@plugin-host';
import { decryptString, encryptString } from '../crypto/encrypt.ts';
import { getKeys } from '../crypto/getKey.ts';
import type { CalendarEvent } from '../types.ts';
import { resolveAccountId } from '../util.ts';
import {
  isEncryptedEvent,
  pickSensitive,
  PUBLIC_PLACEHOLDER,
  publicStart,
  SENSITIVE_FIELDS,
} from '../util.ts';
import { createRecurrenceOccurrences, stripRecurrence } from '../expand.ts';

export async function onUpdatingEvent(data: {localUpdates: Partial<CalendarEvent>, serverUpdates: Partial<CalendarEvent>, eventId: string}): Promise<{localUpdates: Partial<CalendarEvent>, serverUpdates: Partial<CalendarEvent>, eventId: string}> {
  let patch = data.localUpdates;

  // A recurrence rule is being added/changed by this update.
  const hasRecurrence = !!patch.recurrenceRules?.length;

  if (!hasRecurrence && !SENSITIVE_FIELDS.some((f) => f in patch)) {
    return { localUpdates: patch, serverUpdates: patch, eventId: data.eventId };
  }

  const existing: CalendarEvent = await host.calendar.getEvent(data.eventId);
  console.log('exisitng', existing);
  const accountId = await resolveAccountId(existing.accountId);
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
  }

  // Real values only: the payload is never truncated or altered.
  let merged: CalendarEvent = { ...existing, ...currentPayload, ...patch };

  if (hasRecurrence) {
    const created = await createRecurrenceOccurrences(merged, keys.dekAes);
    console.log(`Récurrence: ${created} occurrence`);
    patch = stripRecurrence(patch);
    merged = stripRecurrence(merged);
  }

  const description = await encryptString(JSON.stringify(pickSensitive(merged)), keys.dekAes);

  // Public copy: sensitive fields removed, placeholders applied on every update (idempotent),
  // and the public start always follows the merged start, so moving an event to another
  // month moves it on the server too.
  const updated: Partial<CalendarEvent> = { ...patch };
  for (const f of SENSITIVE_FIELDS) delete updated[f];
  Object.assign(updated, { start: publicStart(merged.start), description });
  console.log('onUpdatingEvent Finished', { localUpdates: patch, serverUpdates: updated, eventId: data.eventId });
  return { localUpdates: patch, serverUpdates: updated, eventId: data.eventId };
}