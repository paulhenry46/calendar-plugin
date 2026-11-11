import { encryptString } from '../crypto/encrypt.ts';
import { getKeys } from '../crypto/getKey.ts';
import type { CalendarEvent, CalendarEventInput } from '../types.ts';
import { resolveAccountId } from '../util.ts';
import { pickSensitive, PUBLIC_PLACEHOLDER, publicStart } from '../util.ts';
import { createRecurrenceOccurrences, expandRecurrence, formatLocal, parseLocal, stripRecurrence } from '../expand.ts';
import host from '@plugin-host';

export async function encryptCalendarEvent(
  event: Partial<CalendarEvent>,
  aesKey: CryptoKey
): Promise<Partial<CalendarEvent>> {
  // The payload is built from the untouched event: real dates are encrypted as-is.
  console.log('Encrypting event 23:', event);
  const description = await encryptString(JSON.stringify(pickSensitive(event)), aesKey);
  // Only the public copy gets the month-truncated start.
  const encryptedEvent = { ...event, ...PUBLIC_PLACEHOLDER, start: publicStart(event.start), description }
  console.log('Event after encryption, before returning:', encryptedEvent);
  return encryptedEvent;
}



export async function onCreatingEvent(data: { localEvent: Partial<CalendarEvent> , serverEvent: Partial<CalendarEvent> }): Promise<{ localEvent: Partial<CalendarEvent> , serverEvent: Partial<CalendarEvent> }> {
  let { localEvent, serverEvent } = data;
  console.log('onBeforeEventCreate called with event:', localEvent);
  const accountId = await resolveAccountId(localEvent.accountId);
  const keys = await getKeys(accountId, { createIfMissing: true });

  if (localEvent.recurrenceRules?.length) {
    const created = await createRecurrenceOccurrences(localEvent, keys.dekAes);
    console.log(`Récurrence: ${created} occurrence(s) supplémentaire(s) créée(s)`);
    localEvent = stripRecurrence(localEvent);
  }
  console.log('Resolved accountId:', accountId);
  console.log('Retrieved keys for account', accountId, keys);
  console.log('Encrypting event with AES key:', keys.dekAes);
  console.log('Event before encryption:', localEvent);
  const finalServerEvent = await encryptCalendarEvent(localEvent, keys.dekAes)
  console.log('Event after encryption, before returning:', finalServerEvent);
  return { localEvent: localEvent , serverEvent: finalServerEvent } ;
}