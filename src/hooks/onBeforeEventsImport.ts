import { getKeys } from "../crypto/getKey.ts";
import { CalendarEvent } from "../types.ts";
import { encryptCalendarEvent } from "./onBeforeEventCreate.ts";

export async function onBeforeImportEvent(params: {
  partialEvents: CalendarEvent[];
  accountId: string;
}): Promise<CalendarEvent[]> {
  const { partialEvents, accountId } = params;

  if (!partialEvents || partialEvents.length === 0) {
    return [];
  }

  const keys = await getKeys(accountId);
  if (!keys) {
    throw new Error("No encryption keys found for this account.");
  }

  return Promise.all(
    partialEvents.map((event) =>
      encryptCalendarEvent(event, keys.dekAes, keys.dekHmac)
    )
  );
}