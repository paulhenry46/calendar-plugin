import type { CalendarEventFilter } from '../types.ts';
import { getCurrentAccountId } from '../util.ts';

/** Filters the server cannot evaluate on encrypted data: re-applied client-side after decryption. */
const CLIENT_SIDE_ONLY: (keyof CalendarEventFilter)[] = ['text', 'title', 'description', 'location', 'attendee'];

/** First day (00:00 UTC) of the month containing `iso`, shifted by `offsetMonths`. */
function monthStartUtc(iso: string, offsetMonths: number): string | undefined {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1)).toISOString();
}

export async function onBeforeFetchEvents(filter: CalendarEventFilter): Promise<CalendarEventFilter> {
  const accountId = await getCurrentAccountId();
  if (!accountId) return filter;

  const { after, before, ...rest } = filter;
  const out: CalendarEventFilter = { ...rest };
  for (const f of CLIENT_SIDE_ONLY) delete out[f];

  // The server only knows the month of each event (stored as the 1st, 00:00 UTC), and an
  // event can span months or sit near a timezone boundary. Widen the window by one month on
  // each side (the end bound is exclusive); the exact range is re-applied after decryption.
  // Each bound is handled independently, so open-ended filters still work.
  const widenedAfter = after ? monthStartUtc(after, -1) : undefined;
  const widenedBefore = before ? monthStartUtc(before, 2) : undefined;
  if (widenedAfter) out.after = widenedAfter;
  if (widenedBefore) out.before = widenedBefore;

  return out;
}