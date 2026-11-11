import { encryptString } from '../crypto/encrypt.ts';
import { getKeys } from '../crypto/getKey.ts';
import type { CalendarEvent, CalendarEventInput } from '../types.ts';
import { resolveAccountId } from '../util.ts';
import { pickSensitive, PUBLIC_PLACEHOLDER, publicStart } from '../util.ts';
import { expandRecurrence, formatLocal, parseLocal } from '../expand.ts';
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

const sanitizeUid = (s: string) => s.replace(/[^A-Za-z0-9._:-]/g, '-');


function shiftUtc(iso: string | null | undefined, deltaMs: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t + deltaMs).toISOString();
}

/** Copie complète de l'événement initial, décalée à la date de l'occurrence, SANS récurrence. */
function buildOccurrenceEvent(
  base: Partial<CalendarEvent>,
  start: string,
  index: number
): Partial<CalendarEvent> {
  const baseUid = sanitizeUid((base.uid ?? crypto.randomUUID()).split('@')[0]).slice(0, 100);
  const deltaMs = parseLocal(start).getTime() - parseLocal(base.start!).getTime();

  const { id, originalId, baseEventId, ...rest } = base; // identifiants propres à l'événement initial
  return {
    ...rest,
    uid: `${baseUid}-r${index}`,
    start,
    utcStart: shiftUtc(base.utcStart, deltaMs),
    utcEnd: shiftUtc(base.utcEnd, deltaMs),
    recurrenceRules: null,
    recurrenceOverrides: null,
    excludedRecurrenceRules: null,
  };
}

async function createRecurrenceOccurrences(base: Partial<CalendarEvent>, aesKey: CryptoKey ): Promise<number> {
  if (!base.start) return 0;

  const initialStart = formatLocal(parseLocal(base.start), !!base.showWithoutTime);

  const others = expandRecurrence(base).filter(s => s !== initialStart);

  const calendarId = base.calendarIds
    ? Object.keys(base.calendarIds).find(id => base.calendarIds![id])
    : undefined;

  for (let i = 0; i < others.length; i++) {
    // 1. Occurrence complète, avec ses vraies dates
    const occurrence = buildOccurrenceEvent(base, others[i], i + 1);

    const enc = await encryptCalendarEvent(occurrence, aesKey);

    const input: CalendarEventInput = {
      title: enc.title ?? '',
      description: enc.description,
      start: enc.start!,
      duration: enc.duration || undefined,
      timeZone: enc.timeZone ?? undefined,
      isAllDay: !!enc.showWithoutTime,
      calendarId,
      uid: occurrence.uid,
    };
    try {
      await host.calendar.createEvent(input);
    } finally {
    }
  }
  return others.length;
}

function stripRecurrence<T extends Partial<CalendarEvent>>(event: T): T {
  return {
    ...event,
    recurrenceRules: null,
    recurrenceOverrides: null,
    excludedRecurrenceRules: null,
  };
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