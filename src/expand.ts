import { encryptCalendarEvent } from './hooks/onCreatingEvent.ts';
import type { CalendarEvent, CalendarEventInput, CalendarRecurrenceRule } from './types.ts';
import host from '@plugin-host';

const MAX_OCCURRENCES = 366;      
const DEFAULT_HORIZON_YEARS = 2; 
const DOW = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
const DAY_MS = 86_400_000;

export function parseLocal(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2}))?/);
  if (!m) throw new Error(`Date invalide: ${s}`);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
}

export function formatLocal(d: Date, dateOnly: boolean): string {
  const iso = d.toISOString(); // 2026-05-01T10:00:00.000Z
  return dateOnly ? iso.slice(0, 10) : iso.slice(0, 19);
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

function nthWeekday(y: number, m: number, dow: number, n: number): number | null {
  const dim = daysInMonth(y, m);
  if (n > 0) {
    const offset = (dow - new Date(Date.UTC(y, m, 1)).getUTCDay() + 7) % 7;
    const day = 1 + offset + (n - 1) * 7;
    return day <= dim ? day : null;
  }
  const offset = (new Date(Date.UTC(y, m, dim)).getUTCDay() - dow + 7) % 7;
  const day = dim - offset + (n + 1) * 7;
  return day >= 1 ? day : null;
}

function periodDays(rule: CalendarRecurrenceRule, start: Date, k: number): Date[] {
  const interval = Math.max(1, rule.interval || 1);
  const y0 = start.getUTCFullYear();
  const m0 = start.getUTCMonth();
  const midnight = Date.UTC(y0, m0, start.getUTCDate());
  const out: Date[] = [];

  switch (rule.frequency) {
    case 'daily':
      out.push(new Date(midnight + k * interval * DAY_MS));
      break;

    case 'weekly': {
      const fdow = DOW.indexOf(rule.firstDayOfWeek ?? 'mo');
      const weekStart = midnight - ((start.getUTCDay() - fdow + 7) % 7) * DAY_MS + k * interval * 7 * DAY_MS;
      if (rule.byDay?.length) {
        const offsets = rule.byDay
          .map(d => (DOW.indexOf(d.day.toLowerCase()) - fdow + 7) % 7)
          .sort((a, b) => a - b);
        for (const o of offsets) out.push(new Date(weekStart + o * DAY_MS));
      } else {
        out.push(new Date(weekStart + ((start.getUTCDay() - fdow + 7) % 7) * DAY_MS));
      }
      break;
    }

    case 'monthly': {
      const total = m0 + k * interval;
      const y = y0 + Math.floor(total / 12);
      const m = ((total % 12) + 12) % 12;
      const dim = daysInMonth(y, m);
      if (rule.byDay?.length) {
        for (const nd of rule.byDay) {
          const dow = DOW.indexOf(nd.day.toLowerCase());
          if (nd.nthOfPeriod) {
            const d = nthWeekday(y, m, dow, nd.nthOfPeriod);
            if (d) out.push(new Date(Date.UTC(y, m, d)));
          } else {
            for (let d = 1; d <= dim; d++) {
              if (new Date(Date.UTC(y, m, d)).getUTCDay() === dow) out.push(new Date(Date.UTC(y, m, d)));
            }
          }
        }
      } else {
        const days = rule.byMonthDay?.length ? rule.byMonthDay : [start.getUTCDate()];
        for (const d of days) {
          const day = d < 0 ? dim + d + 1 : d;
          if (day >= 1 && day <= dim) out.push(new Date(Date.UTC(y, m, day))); // jour inexistant => omis (RFC 5545)
        }
      }
      break;
    }

    case 'yearly': {
      const y = y0 + k * interval;
      const m = m0;
      const d = start.getUTCDate();
      if (d <= daysInMonth(y, m)) out.push(new Date(Date.UTC(y, m, d))); // 29 février => omis les années non bissextiles
      break;
    }

    default:
      throw new Error(`Fréquence non supportée: ${rule.frequency}`);
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

export function expandRecurrence(event: Partial<CalendarEvent>): string[] {
  const rule = event.recurrenceRules?.[0];
  if (!rule || !event.start) return [];

  const start = parseLocal(event.start);
  const timeMs = start.getTime() % DAY_MS;
  const dateOnly = !!event.showWithoutTime;

  let limit = new Date(start);
  limit.setUTCFullYear(limit.getUTCFullYear() + DEFAULT_HORIZON_YEARS);
  if (rule.until) {
    const u = parseLocal(rule.until);
    if (!rule.until.includes('T')) u.setUTCHours(23, 59, 59); // until date seule => jour inclus
    limit = u;
  }
  const maxCount = Math.min(rule.count ?? Infinity, MAX_OCCURRENCES);

  const result: string[] = [];

  for (let k = 0; k < 5000 && result.length < maxCount; k++) {
    for (const day of periodDays(rule, start, k)) {
      const occ = new Date(day.getTime() + timeMs);
      if (occ < start) continue;
      if (rule.until || !rule.count) { if (occ > limit) return result; }
      result.push(formatLocal(occ, dateOnly));
      if (result.length >= maxCount) return result;
    }
  }
  return result;
}


const sanitizeUid = (s: string) => s.replace(/[^A-Za-z0-9._:-]/g, '-');


function shiftUtc(iso: string | null | undefined, deltaMs: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : new Date(t + deltaMs).toISOString();
}

/** Copie complète de l'événement initial, décalée à la date de l'occurrence, SANS récurrence. */
function buildOccurrenceEvent(
  base: Partial<CalendarEvent>,
  start: string,
  index: number
): Partial<CalendarEvent> {
  const baseUid = sanitizeUid((base.uid ?? crypto.randomUUID()).split('@')[0]).slice(0, 100);
  const deltaMs = parseLocal(start).getTime() - parseLocal(base.start!).getTime();

  const { id, originalId, baseEventId, ...rest } = base; // identifiants propres à l'événement initial
  return {
    ...rest,
    uid: `${baseUid}-r${index}`,
    start,
    utcStart: shiftUtc(base.utcStart, deltaMs),
    utcEnd: shiftUtc(base.utcEnd, deltaMs),
    recurrenceRules: null,
    recurrenceOverrides: null,
    excludedRecurrenceRules: null,
  };
}

export async function createRecurrenceOccurrences(base: Partial<CalendarEvent> ): Promise<number> {
  if (!base.start) return 0;
  console.log('base occurence non chiffré', base)

  const initialStart = formatLocal(parseLocal(base.start), !!base.showWithoutTime);

  const others = expandRecurrence(base).filter(s => s !== initialStart);
  console.log('other number', others)
  const calendarId = base.calendarIds
    ? Object.keys(base.calendarIds).find(id => base.calendarIds![id])
    : undefined;

  for (let i = 0; i < others.length; i++) {
    // 1. Occurrence complète, avec ses vraies dates
    const occurrence = buildOccurrenceEvent(base, others[i], i + 1);
    console.log('occurence créee non chiffré', i, occurrence)

    console.log('occurence créee chiffrée', i, occurrence)
    const input: CalendarEventInput = {
      title: occurrence.title ?? '',
      description: occurrence.description,
      start: occurrence.start!,
      duration: occurrence.duration || undefined,
      timeZone: occurrence.timeZone ?? undefined,
      isAllDay: !!occurrence.showWithoutTime,
      calendarId,
      uid: occurrence.uid,
    };
    try {
      const result = await host.calendar.createEvent(input);
      console.log('crée result', result);
    } catch(e) {
      console.log(e);
    }
  }
  return others.length;
}

export function stripRecurrence<T extends Partial<CalendarEvent>>(event: T): T {
  return {
    ...event,
    recurrenceRules: null,
    recurrenceOverrides: null,
    excludedRecurrenceRules: null,
  };
}