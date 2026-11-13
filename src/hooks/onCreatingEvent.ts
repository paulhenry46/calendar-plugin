import { encryptString } from '../crypto/encrypt.ts';
import { getKeys } from '../crypto/getKey.ts';
import type { CalendarEvent } from '../types.ts';
import { resolveAccountId } from '../util.ts';
import { pickSensitive, PUBLIC_PLACEHOLDER, publicStart } from '../util.ts';
import { createRecurrenceOccurrences, stripRecurrence } from '../expand.ts';
import host from '@plugin-host';

/**
 * Placeholder fields that must NOT be applied when the event carries alerts:
 * the server has to know the real title and the real date/time to fire them.
 */
export const CLEAR_WHEN_ALERTS = [
  'title',
  'utcStart',
  'utcEnd',
  'duration',
  'timeZone',
  'showWithoutTime',
] as const;

/** True when the event has at least one alert. */
export function hasAlerts(event: Partial<CalendarEvent>): boolean {
  return !!event.alerts && Object.keys(event.alerts).length > 0;
}

/** Placeholders to send to the server: all of them, or all except the ones kept in clear for alerts. */
export function placeholderFor(keepClear: boolean): Partial<typeof PUBLIC_PLACEHOLDER> {
  const placeholder: Partial<typeof PUBLIC_PLACEHOLDER> = { ...PUBLIC_PLACEHOLDER };
  if (keepClear) for (const f of CLEAR_WHEN_ALERTS) delete placeholder[f];
  return placeholder;
}

export async function encryptCalendarEvent(
  event: Partial<CalendarEvent>,
  aesKey: CryptoKey,
  options: { keepClear?: boolean } = {}
): Promise<Partial<CalendarEvent>> {
  // The payload is built from the untouched event: real dates are encrypted as-is.
  const description = await encryptString(JSON.stringify(pickSensitive(event)), aesKey);

  if (options.keepClear) {
    // Alerts: title, start and time fields stay in clear on the server.
    // The other placeholders (participants, locations, ...) are still applied.
    return { ...event, ...placeholderFor(true), description };
  }

  // Only the public copy gets the month-truncated start.
  return { ...event, ...placeholderFor(false), start: publicStart(event.start), description };
}

/** Asks the user to confirm that title and date/time will be stored in clear because of the alerts. */
export async function confirmClearForAlerts(isRecurrent: boolean): Promise<boolean> {
  let message = host.i18n.t('alerts.clear_confirm.message');
  if (isRecurrent) {
    message += '\n\n' + host.i18n.t('alerts.clear_confirm.recurrent_note');
  }

  return await host.ui.confirm({
    title: host.i18n.t('alerts.clear_confirm.title'),
    message,
    danger: true,
    confirmLabel: host.i18n.t('alerts.clear_confirm.confirm'),
  });
}

export async function onCreatingEvent(data: { localEvent: Partial<CalendarEvent> , serverEvent: Partial<CalendarEvent> }): Promise<{ localEvent: Partial<CalendarEvent> , serverEvent: Partial<CalendarEvent> }> {
  let { localEvent } = data;
  // if uid has an @, we must remove the part behinf the @. Indeed, when creating avent from api, a part naming the plugin id added. 
  // This is not the case when creating a single event with the hook. As a result, this can disclose info about which event is recurrent or not.
  if (localEvent.uid?.includes("@")) {
    localEvent.uid = localEvent.uid.substring(0, localEvent.uid.indexOf("@"));
  }
  
  const accountId = await resolveAccountId(localEvent.accountId);
  const keys = await getKeys(accountId, { createIfMissing: true });

  let keepClear = hasAlerts(localEvent);
  const isRecurrent = !!localEvent.recurrenceRules?.length;

  // Ask BEFORE anything is created, so that a refusal leaves no orphan occurrence.
  if (keepClear && !(await confirmClearForAlerts(isRecurrent))) {
    // we remove alert data and toggle keepClear
    localEvent.alerts = null;
    keepClear = false;
  }

  if (isRecurrent) {
    // Occurrences are created without alerts (CalendarEventInput has no such field)
    // and stay fully encrypted.
    const created = await createRecurrenceOccurrences(localEvent);
    localEvent = stripRecurrence(localEvent);
  }

  const finalServerEvent = await encryptCalendarEvent(localEvent, keys.dekAes, { keepClear });
  return { localEvent, serverEvent: finalServerEvent };
}