import host from '@plugin-host';
import { decryptString, encryptString } from '../crypto/encrypt.ts';
import { getKeys } from '../crypto/getKey.ts';
import type { CalendarEvent } from '../types.ts';
import { resolveAccountId } from '../util.ts';
import {
  computeMonthIndexTitle,
  isEncryptedEvent,
  pickSensitive,
  PUBLIC_PLACEHOLDER,
  SENSITIVE_FIELDS,
} from './payload.ts';

const TIME_FIELDS = ['start', 'utcStart', 'duration', 'utcEnd'] as const;

export async function onBeforeUpdateEvent(
  patch: Partial<CalendarEvent>,
  eventId: string
): Promise<Partial<CalendarEvent>> {
  // Rien de sensible touché (couleur, alertes, statut…) : le patch part tel quel.
  if (!SENSITIVE_FIELDS.some((f) => f in patch)) return patch;

  const existing: CalendarEvent = await host.api.event.get(eventId);
  const accountId = await resolveAccountId(existing.accountId);
  const keys = await getKeys(accountId);

  // 1. Reconstituer l'événement complet : champs serveur + payload déchiffré + patch.
  let currentPayload: Partial<CalendarEvent> = {};
  const alreadyEncrypted = isEncryptedEvent(existing);
  if (alreadyEncrypted) {
    try {
      currentPayload = JSON.parse(await decryptString(existing.description, keys.dekAes));
    } catch (error) {
      // On refuse d'écraser : réécrire avec un payload vide détruirait des données
      // peut-être récupérables (ex. mauvais secret côté plugin maître).
      throw new Error('Failed to decrypt the existing event payload, update aborted: ' + error);
    }
  }
  // Sinon : événement legacy en clair (ou déjà déchiffré par l'hôte) → sa mise à jour le chiffre.
  const merged: CalendarEvent = { ...existing, ...currentPayload, ...patch };

  // 2. Rechiffrer tout le payload sensible.
  const description = await encryptString(JSON.stringify(pickSensitive(merged)), keys.dekAes);

  // 3. Construire le patch envoyé au serveur : AUCUN champ sensible en clair.
  const updated: Partial<CalendarEvent> = { ...patch };
  for (const f of SENSITIVE_FIELDS) delete updated[f];
  updated.description = description;

  // L'index de mois (dans `title`) ne change que si le temps change.
  const timeChanged = TIME_FIELDS.some((f) => f in patch);
  if (timeChanged || !alreadyEncrypted) {
    updated.title = await computeMonthIndexTitle(merged, keys.dekHmac);
  }
  if (!alreadyEncrypted) Object.assign(updated, PUBLIC_PLACEHOLDER);

  return updated;
}