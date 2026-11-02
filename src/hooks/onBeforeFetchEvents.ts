
/** First day (00:00 UTC) of the month containing `iso`, shifted by `offsetMonths`. */
function monthStartUtc(iso: string, offsetMonths: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1)).toISOString();
}

export async function onBeforeFetchEvents(filter: {start: string; end: string}): Promise<{start: string; end: string}> {
  console.log('onBeforeFetchEvents', filter);
  return {start : monthStartUtc(filter.start, -1), end: monthStartUtc(filter.end, 2)};
}