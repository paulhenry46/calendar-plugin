import host from '@plugin-host';

export const MAX_MONTHS = 240;
const DAY_MS = 86_400_000;

export async function getCurrentAccountId(): Promise<string | undefined> {
  const accounts = await host.user.getAccounts();
  const current = accounts.find((a) => a.isActive);
  if (!current) {
    host.log.warn('No active account found.');
  }
  return current?.id;
}

/** Retourne `accountId` s'il est fourni, sinon le compte actif. Lève si aucun compte. */
export async function resolveAccountId(accountId?: string | null): Promise<string> {
  const id = accountId || (await getCurrentAccountId());
  if (!id) throw new Error('No account available to select the encryption keys.');
  return id;
}


export function getCoveredMonths(
  startIso: string,
  durationIso?: string | null,
  endIso?: string | null,
  padMs = 0
): string[] {
  const startDate = new Date(startIso);
  if (Number.isNaN(startDate.getTime())) return [];

  let endDate: Date;
  if (endIso && !Number.isNaN(new Date(endIso).getTime())) {
    endDate = new Date(endIso);
  } else if (durationIso) {
    endDate = new Date(startDate.getTime() + parseIsoDurationToMs(durationIso));
  } else {
    endDate = new Date(startDate);
  }

  return monthsBetween(new Date(startDate.getTime() - padMs), new Date(endDate.getTime() + padMs));
}

export function monthsBetween(from: Date, to: Date): string[] {
  const months: string[] = [];
  const current = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const last = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

  while (current <= last) {
    if (months.length >= MAX_MONTHS) {
      host.log.warn(`Month range truncated to ${MAX_MONTHS} months.`);
      break;
    }
    months.push(`${current.getUTCFullYear()}-${String(current.getUTCMonth() + 1).padStart(2, '0')}`);
    current.setUTCMonth(current.getUTCMonth() + 1);
  }
  return months;
}

/** Marge d'un jour utilisée à l'indexation (décalages de fuseau). */
export const INDEX_PAD_MS = DAY_MS;

export function parseIsoDurationToMs(duration: string): number {
  const m = duration.match(/^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.\d+)?S)?)?$/);
  if (!m) return 3_600_000;
  const [years, months, weeks, days, hours, mins, secs] = m.slice(1).map((v) => parseInt(v || '0', 10));
  const ms =
    (years * 365 + months * 30 + weeks * 7 + days) * DAY_MS +
    hours * 3_600_000 +
    mins * 60_000 +
    secs * 1000;
  return ms || 3_600_000;
}

/** Évite de spammer l'utilisateur : un même message au plus une fois par `everyMs`. */
const lastNotified = new Map<string, number>();
export function notifyThrottled(message: string, everyMs = 15_000): void {
  const now = Date.now();
  if (now - (lastNotified.get(message) ?? 0) < everyMs) return;
  lastNotified.set(message, now);
  try {
    host.toast.error(message);
  } catch {
    /* ignore */
  }
}
