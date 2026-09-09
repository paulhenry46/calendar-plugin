import { encryptString } from "../crypto/encrypt.ts";
import { CalendarEvent } from "../types.ts";

export async function encryptCalendarEvent(
  event: CalendarEvent,
  key: CryptoKey
): Promise<CalendarEvent> {
  const eventDate = new Date(event.start || event.utcStart || Date.now());
  const monthString = `${eventDate.getUTCFullYear()}-${String(eventDate.getUTCMonth() + 1).padStart(2, '0')}`;

  const encryptedMonthTitle = await encryptString(monthString, key);

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
    key
  );

  return {
    ...event,
    title: encryptedMonthTitle,
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