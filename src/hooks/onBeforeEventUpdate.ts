import { encryptString, decryptString, generateMonthIndex } from "../crypto/encrypt.ts";
import { getKeys } from "../crypto/getKey.ts";
import { CalendarEvent } from "../types.ts";
import { getCoveredMonths, getCurrentAccountId } from "../util.ts";
import  host  from '@plugin-host';

// Liste des champs sensibles stockés dans le payload chiffré
const SENSITIVE_FIELDS: (keyof CalendarEvent)[] = [
  "title",
  "description",
  "utcStart",
  "utcEnd",
  "start",
  "duration",
  "timeZone",
  "keywords",
  "categories",
  "locale",
  "replyTo",
  "organizerCalendarAddress",
  "participants",
  "locations",
  "virtualLocations",
  "links",
  "relatedTo",
];

export async function onBeforeUpdateEvent(
patch: Partial<CalendarEvent>,
eventId: string,
): Promise<Partial<CalendarEvent>> {

  const existingEncryptedEvent: CalendarEvent = await host.api.event.get(eventId);

  const accountId = existingEncryptedEvent.accountId || (await getCurrentAccountId()) || "";
  const keys = await getKeys(accountId);
  if (!keys) {
    throw new Error("No encryption keys found for this account.");
  }

  const hasSensitiveChanges = SENSITIVE_FIELDS.some((field) => field in patch);

  if (!hasSensitiveChanges) {
    return patch;
  }

  let currentPayload: Partial<CalendarEvent> = {};
  if (existingEncryptedEvent.description) {
    try {
      const decryptedJson = await decryptString(existingEncryptedEvent.description, keys.dekAes);
      currentPayload = JSON.parse(decryptedJson);
    } catch (error) {
      throw new Error("Failed to decrypt existing event payload: " + error);
    }
  }

  const mergedFullEvent: CalendarEvent = {
    ...existingEncryptedEvent,
    ...currentPayload,
    ...patch,
  };

  const updatedSensitivePayload = SENSITIVE_FIELDS.reduce((acc, field) => {
    acc[field] = mergedFullEvent[field] ?? null;
    return acc;
  }, {} as Record<string, any>);

  const newEncryptedDescription = await encryptString(
    JSON.stringify(updatedSensitivePayload),
    keys.dekAes
  );

  const timeChanged = "start" in patch || "utcStart" in patch || "duration" in patch || "utcEnd" in patch;
  let newMonthIndexTitle: string | undefined;

  if (timeChanged) {
    const coveredMonths = getCoveredMonths(
      mergedFullEvent.start || mergedFullEvent.utcStart || "1970-01-01T00:00:00Z",
      mergedFullEvent.duration,
      mergedFullEvent.utcEnd
    );
    const monthHashes = await Promise.all(
      coveredMonths.map((ym) => generateMonthIndex(ym, keys.dekHmac))
    );
    newMonthIndexTitle = monthHashes.join(",");
  }

  const updatedPatch: Partial<CalendarEvent> = {
    ...patch,
    description: newEncryptedDescription,
  };

  if (timeChanged && newMonthIndexTitle) {
    updatedPatch.title = newMonthIndexTitle;
  }

  for (const field of SENSITIVE_FIELDS) {
    if (field !== "title" && field !== "description") {
      delete updatedPatch[field];
    }
  }

  return updatedPatch;
}