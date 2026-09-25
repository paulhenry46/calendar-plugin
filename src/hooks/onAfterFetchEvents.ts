import { decryptString } from "../crypto/encrypt.ts";
import { getKeys } from "../crypto/getKey.ts";
import { CalendarEvent } from "../types.ts";
import { getCurrentAccountId } from "../util.ts";

export async function decryptCalendarEvent(
  encryptedEvent: CalendarEvent,
  aesKey: CryptoKey
): Promise<CalendarEvent> {
  if (!encryptedEvent.description) {
    return encryptedEvent;
  }

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

export async function onAfterFetchEvent(
  events: CalendarEvent[]
): Promise<CalendarEvent[]> {
  if (!events || events.length === 0) {
    return [];
  }

  const accountId = events[0].accountId || (await getCurrentAccountId()) || "";

  const keys = await getKeys(accountId);
  if (!keys) {
    throw new Error("No encryption keys found for this account.");
  }

  return Promise.all(
    events.map((event) => decryptCalendarEvent(event, keys.dekAes))
  );
}