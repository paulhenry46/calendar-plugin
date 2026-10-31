import host from '@plugin-host';
import { decryptString, encryptString } from '../crypto/encrypt.ts';
import { getKeys } from '../crypto/getKey.ts';
import type { CalendarEvent } from '../types.ts';
import { resolveAccountId } from '../util.ts';
import {
  isEncryptedEvent,
  pickSensitive,
  PUBLIC_PLACEHOLDER,
  SENSITIVE_FIELDS,
} from './payload.ts';

const TIME_FIELDS = ['start', 'utcStart', 'duration', 'utcEnd'] as const;

export async function onBeforeUpdateEvent(
  patch: Partial<CalendarEvent>,
  eventId: string
): Promise<Partial<CalendarEvent>> {
  if (!SENSITIVE_FIELDS.some((f) => f in patch)) return patch;

  const existing: CalendarEvent = await host.api.event.get(eventId);
  const accountId = await resolveAccountId(existing.accountId);
  const keys = await getKeys(accountId);

  let currentPayload: Partial<CalendarEvent> = {};
  const alreadyEncrypted = isEncryptedEvent(existing);
  if (alreadyEncrypted) {
    try {
      currentPayload = JSON.parse(await decryptString(existing.description, keys.dekAes));
    } catch (error) {
      throw new Error('Failed to decrypt the existing event payload, update aborted: ' + error);
    }
  }
  const merged: CalendarEvent = { ...existing, ...currentPayload, ...patch };

  const timeChanged = TIME_FIELDS.some((f) => f in patch);
  if (timeChanged && patch.start && existing.start) {
    const oldDate = new Date(existing.start);
    const newDate = new Date(patch.start);

    if (oldDate.getFullYear() !== newDate.getFullYear() || oldDate.getMonth() !== newDate.getMonth()) {
      const adjustedDate = new Date(Date.UTC(newDate.getFullYear(), newDate.getMonth(), 1, 0, 0, 0, 0));
      patch.start = adjustedDate.toISOString();
      merged.start = patch.start;
    }
  }

  if (timeChanged && patch.utcStart && existing.utcStart) {
    const oldDate = new Date(existing.utcStart);
    const newDate = new Date(patch.utcStart);

    if (oldDate.getFullYear() !== newDate.getFullYear() || oldDate.getMonth() !== newDate.getMonth()) {
      const adjustedDate = new Date(Date.UTC(newDate.getFullYear(), newDate.getMonth(), 1, 0, 0, 0, 0));
      patch.utcStart = adjustedDate.toISOString();
      merged.utcStart = patch.utcStart;
    }
  }

  const description = await encryptString(JSON.stringify(pickSensitive(merged)), keys.dekAes);

  const updated: Partial<CalendarEvent> = { ...patch };
  for (const f of SENSITIVE_FIELDS) delete updated[f];
  updated.description = description;

  if (!alreadyEncrypted) Object.assign(updated, PUBLIC_PLACEHOLDER);

  return updated;
}