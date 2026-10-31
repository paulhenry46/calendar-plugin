import host from '@plugin-host';
import type { CalendarEventFilter } from '../types.ts';
import { getCurrentAccountId } from '../util.ts';

const CLIENT_SIDE_ONLY: (keyof CalendarEventFilter)[] = ['text', 'title', 'description', 'location', 'attendee'];

export async function onBeforeFetchEvents(filter: CalendarEventFilter): Promise<CalendarEventFilter> {
  const accountId = await getCurrentAccountId();
  if (!accountId) return filter;

  const { after, before, ...rest } = filter;
  const cleaned: CalendarEventFilter = { ...rest };
  for (const f of CLIENT_SIDE_ONLY) delete cleaned[f];

  if (!after && !before) return cleaned;

  if (!after || !before) {
    host.log.warn('Open-ended date filter cannot be evaluated server-side; returning all events.');
    return cleaned;
  }
  const startDate = new Date(after);
  const endDate = new Date(before);

  const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 1);

  return {
    ...cleaned,
    after: startMonth.toISOString(),
    before: endMonth.toISOString(),
  };
}