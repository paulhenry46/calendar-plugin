import { decryptString } from "../crypto/encrypt.ts";
import { CalendarEvent } from "../types.ts";

export async function decryptCalendarEvent(
  encryptedEvent: CalendarEvent,
  aesKey: CryptoKey
): Promise<CalendarEvent> {
  const decryptedJson = await decryptString(encryptedEvent.description, aesKey);
  const sensitivePayload = JSON.parse(decryptedJson);

  return {
    ...encryptedEvent,
    title: sensitivePayload.title,
    description: sensitivePayload.description,
    utcStart: sensitivePayload.utcStart,
    utcEnd: sensitivePayload.utcEnd,
    start: sensitivePayload.start,
    duration: sensitivePayload.duration,
    timeZone: sensitivePayload.timeZone,
    keywords: sensitivePayload.keywords,
    categories: sensitivePayload.categories,
    locale: sensitivePayload.locale,
    replyTo: sensitivePayload.replyTo,
    organizerCalendarAddress: sensitivePayload.organizerCalendarAddress,
    participants: sensitivePayload.participants,
    locations: sensitivePayload.locations,
    virtualLocations: sensitivePayload.virtualLocations,
    links: sensitivePayload.links,
    relatedTo: sensitivePayload.relatedTo,
  };
}