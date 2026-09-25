import { getKeys } from "../crypto/getKey.ts";
import { CalendarEventFilter, CalendarEventFilterCondition, CalendarEventFilterOperator } from "../types.ts";
import { getCurrentAccountId } from "../util.ts";

export async function onBeforeFetchEvents(filter: CalendarEventFilter): Promise<CalendarEventFilter> {
  const keys = await getKeys(await getCurrentAccountId() || '');
  if (!keys) {
    throw new Error("No encryption keys found for this account.");
  }
  return editFilter(filter, keys.dekHmac);
}

async function editFilter(filter: CalendarEventFilter, hmacKey: CryptoKey): Promise<CalendarEventFilter> {
  if ('operator' in filter) {
    const updatedConditions = await Promise.all(
      filter.conditions.map((subFilter) => editFilter(subFilter, hmacKey))
    );
    return {
      ...filter,
      conditions: updatedConditions,
    };
  }

  if (filter.after && filter.before) {
    const months = getMonthsInInterval(filter.after, filter.before);
    
    const signedMonths = await Promise.all(
      months.map((monthStr) => signString(monthStr, hmacKey))
    );

    const { after, before, title, ...rest } = filter;

    const monthConditions: CalendarEventFilterCondition[] = signedMonths.map((signedMonth) => ({
      ...rest,
      title: signedMonth,
    }));

    if (monthConditions.length === 1) {
      return monthConditions[0];
    }

    return {
      operator: 'OR',
      conditions: monthConditions,
    };
  }

  return filter;
}

function getMonthsInInterval(afterStr: string, beforeStr: string): string[] {
  const startDate = new Date(afterStr);
  const endDate = new Date(beforeStr);
  const months: string[] = [];

  const current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (current <= last) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
    
    // Passer au mois suivant
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

async function signString(data: string, hmacKey: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const encodedData = encoder.encode(data);
  const signatureBuffer = await crypto.subtle.sign("HMAC", hmacKey, encodedData);
  
  // Convertir ArrayBuffer en Hex String
  return Array.from(new Uint8Array(signatureBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}