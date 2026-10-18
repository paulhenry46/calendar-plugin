import { generateMonthIndex } from '../crypto/encrypt.ts';
import type { CalendarEvent } from '../types.ts';
import { getCoveredMonths, INDEX_PAD_MS } from '../util.ts';

/** Champs déplacés dans le payload chiffré (stocké dans `description`). */
export const SENSITIVE_FIELDS = [
  'title',
  'description',
  'utcStart',
  'utcEnd',
  'start',
  'duration',
  'timeZone',
  'keywords',
  'categories',
  'locale',
  'replyTo',
  'organizerCalendarAddress',
  'participants',
  'locations',
  'virtualLocations',
  'links',
  'relatedTo',
] as const satisfies readonly (keyof CalendarEvent)[];

export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

/** Valeurs "neutres" envoyées en clair au serveur à la place des vraies. */
export const PUBLIC_PLACEHOLDER = {
  utcStart: null,
  utcEnd: null,
  start: '1970-01-01T00:00:00', // LocalDateTime JSCalendar : pas de "Z"
  duration: 'PT1H',
  timeZone: 'UTC',
  keywords: null,
  categories: null,
  locale: null,
  replyTo: null,
  organizerCalendarAddress: null,
  participants: null,
  locations: null,
  virtualLocations: null,
  links: null,
  relatedTo: null,
} satisfies Partial<CalendarEvent>;

export function pickSensitive(event: Partial<CalendarEvent>): Record<SensitiveField, unknown> {
  const out = {} as Record<SensitiveField, unknown>;
  for (const f of SENSITIVE_FIELDS) out[f] = event[f] ?? null;
  return out;
}

/**
 * Index aveugle : un HMAC par mois couvert par l'événement, séparés par des virgules,
 * stocké dans `title`. Le serveur peut ainsi filtrer "les événements du mois M" sans rien
 * connaître des dates réelles. L'intervalle est élargi d'un jour (fuseaux) → sur-ensemble.
 */
export async function computeMonthIndexTitle(
  event: Partial<CalendarEvent>,
  hmacKey: CryptoKey
): Promise<string> {
  const startIso = event.utcStart || event.start;
  if (!startIso) throw new Error('Event has no start date: cannot index it.');

  const months = getCoveredMonths(
    startIso,
    event.duration,
    event.utcStart ? event.utcEnd : null,
    INDEX_PAD_MS
  );
  if (months.length === 0) throw new Error(`Invalid event start date "${startIso}": cannot index it.`);

  const hashes = await Promise.all(months.map((ym) => generateMonthIndex(ym, hmacKey)));
  return hashes.join(',');
}

const MONTH_INDEX_RE = /^[0-9a-f]{64}(,[0-9a-f]{64})*$/;

/**
 * Un événement chiffré par ce plugin a pour `title` une liste de HMAC hex de 64 caractères.
 * Permet de distinguer un événement chiffré d'un événement "legacy" en clair (créé avant le
 * plugin) ou déjà déchiffré par l'hôte.
 */
export function isEncryptedEvent(event: Partial<CalendarEvent>): boolean {
  return typeof event.title === 'string' && !!event.description && MONTH_INDEX_RE.test(event.title);
}
