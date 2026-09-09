import { encryptString, generateMonthIndex } from "../crypto/encrypt.ts";
import { CalendarEvent } from "../types.ts";
import { getCoveredMonths } from "../util.ts";

export async function encryptCalendarEvent(
  event: CalendarEvent,
  aesKey: CryptoKey,
  hmacIndexKey: CryptoKey
): Promise<CalendarEvent> {
  const coveredMonths = getCoveredMonths(event.start || event.utcStart || '1970-01-01T00:00:00Z', event.duration, event.utcEnd);

  const monthHashes = await Promise.all(
    coveredMonths.map(ym => generateMonthIndex(ym, hmacIndexKey))
  );
  const monthIndexTitle = monthHashes.join(',');

  const sensitivePayload = {
    title: event.title,
    description: event.description,
    utcStart: event.utcStart,
    utcEnd: event.utcEnd,
    start: event.start,
    duration: event.duration,
    timeZone: event.timeZone,
    keywords: event.keywords,
    categories: event.categories,
    locale: event.locale,
    replyTo: event.replyTo,
    organizerCalendarAddress: event.organizerCalendarAddress,
    participants: event.participants,
    locations: event.locations,
    virtualLocations: event.virtualLocations,
    links: event.links,
    relatedTo: event.relatedTo,
  };

  const encryptedDescription = await encryptString(
    JSON.stringify(sensitivePayload),
    aesKey
  );

  return {
    ...event,
    title: monthIndexTitle,
    description: encryptedDescription,
    utcStart: null,
    utcEnd: null,
    start: '1970-01-01T00:00:00Z',
    duration: 'PT1H',
    timeZone: 'UTC',
    keywords: null,
    categories: null,
    locale: null,
    replyTo: null,
    organizerCalendarAddress: null,
    participants: null,
    locations: null,
    virtualLocations: null,
    links: null,
    relatedTo: null,
  };
}