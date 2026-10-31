import {
  broadcastUnlockKey,
  fetchKeyFromBackground,
  getBackgroundSessionKey,
} from './broadcastChannel.ts';
import { base64ToBuffer, bufferToBase64 } from './encrypt.ts';
import { getDataFromMaster, putKeysToMaster } from './masterPlugin.ts';

export interface LocalEncryptedEnvelope {
  iv: string;
  wrappedKeys: string;
}

export interface CalendarKeys {
  dekAes: CryptoKey;
  dekHmac: CryptoKey;
}

export type CalendarCryptoErrorCode =
  | 'MASTER_UNAVAILABLE' // plugin maître absent, ou sans clé par défaut pour ce compte
  | 'MASTER_LOCKED' // plugin maître présent mais clé par défaut verrouillée
  | 'NO_KEYS' // le maître répond mais aucune clé n'existe pour ce compte
  | 'STORE_FAILED' // le maître n'a pas confirmé le stockage des nouvelles clés
  | 'UNWRAP_FAILED'; // enveloppe illisible (secret changé / données corrompues)

export class CalendarCryptoError extends Error {
  constructor(public code: CalendarCryptoErrorCode, message: string) {
    super(message);
    this.name = 'CalendarCryptoError';
  }
}

/** Dérive la KEK (AES-GCM) à partir du secret fourni par le plugin maître. */
export async function importSecretAsKek(secret: string): Promise<CryptoKey> {
  const rawKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['decrypt', 'encrypt']);
}

export async function unlockCalendarKeys(
  secretFromMaster: string,
  envelope: LocalEncryptedEnvelope
): Promise<CalendarKeys> {
  const kek = await importSecretAsKek(secretFromMaster);

  let payload: { rawAes: string; rawHmac: string };
  console.log('Unlocking calendar keys with secret', secretFromMaster, 'and envelope', envelope);
  console.log('derived kek', kek);
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBuffer(envelope.iv) },
      kek,
      base64ToBuffer(envelope.wrappedKeys)
    );
    console.log('Decrypted payload', new TextDecoder().decode(decrypted));
    payload = JSON.parse(new TextDecoder().decode(decrypted));
  } catch (e) {
    console.error('Failed to unwrap calendar keys with secret', secretFromMaster, 'and envelope', envelope, e); 
    throw new CalendarCryptoError(
      'UNWRAP_FAILED',
      'Unable to unwrap the calendar keys with the secret provided by the master plugin.'
    );
  }

  // Non extractibles : une fois importées, le JS ne peut plus relire le matériel brut.
  const dekAes = await crypto.subtle.importKey(
    'raw',
    base64ToBuffer(payload.rawAes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  const dekHmac = await crypto.subtle.importKey(
    'raw',
    base64ToBuffer(payload.rawHmac),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return { dekAes, dekHmac };
}

export async function generateAndWrapCalendarKeys(secretFromMaster: string): Promise<LocalEncryptedEnvelope> {
  const kek = await importSecretAsKek(secretFromMaster);
  console.log('Generating new calendar keys and wrapping them with secret', secretFromMaster, 'and kek', kek);

  // extractable: true uniquement le temps de les emballer (wrap) ; ces objets ne sortent pas d'ici.
  const dekAes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const dekHmac = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, ['sign', 'verify']);

  const payload = JSON.stringify({
    rawAes: bufferToBase64(await crypto.subtle.exportKey('raw', dekAes)),
    rawHmac: bufferToBase64(await crypto.subtle.exportKey('raw', dekHmac)),
  });

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kek, new TextEncoder().encode(payload));

  return { iv: bufferToBase64(iv), wrappedKeys: bufferToBase64(encrypted) };
}

// ─── Point d'entrée ─────────────────────────────────────────────────────

const inflight = new Map<string, Promise<CalendarKeys>>();

export interface GetKeysOptions {
  /**
   * Autorise la génération de nouvelles clés si le maître n'en a aucune pour ce compte.
   * À réserver aux chemins d'ÉCRITURE (création / import) ou à l'action explicite de
   * l'utilisateur : générer des clés par erreur à la lecture rendrait les données existantes
   * indéchiffrables.
   */
  createIfMissing?: boolean;
}

/**
 * Ordre : cache local → autres onglets → plugin maître (+ génération optionnelle).
 * Les appels concurrents pour un même compte partagent la même promesse
 * (un fetch de calendrier peut déclencher des dizaines de hooks en parallèle).
 */
export function getKeys(accountId: string, opts: GetKeysOptions = {}): Promise<CalendarKeys> {
  const local = getBackgroundSessionKey(accountId);
  if (local) return Promise.resolve({ dekAes: local.aesKey, dekHmac: local.hmacKey });

  const key = `${accountId}|${opts.createIfMissing ? 'c' : 'r'}`;
  let p = inflight.get(key);
  if (!p) {
    p = loadKeys(accountId, opts).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

async function loadKeys(accountId: string, opts: GetKeysOptions): Promise<CalendarKeys> {
  const fromTab = await fetchKeyFromBackground(accountId);
  if (fromTab) {
    broadcastUnlockKey(fromTab); // met aussi en cache localement
    return { dekAes: fromTab.aesKey, dekHmac: fromTab.hmacKey };
  }

  const response = await getDataFromMaster(accountId);
  if (response.state === 'unavailable') {
    throw new CalendarCryptoError(
      'MASTER_UNAVAILABLE',
      'Cannot reach the master plugin. Make sure it is installed and that a default key is set for this account.'
    );
  }
  if (response.state === 'locked') {
    throw new CalendarCryptoError('MASTER_LOCKED', 'The master plugin is locked: unlock your default key.');
  }

  let keys: CalendarKeys;
  if (response.data === undefined) {
    if (!opts.createIfMissing) {
      throw new CalendarCryptoError('NO_KEYS', 'No calendar keys exist for this account yet.');
    }
    const envelope = await generateAndWrapCalendarKeys(response.secret);
    console.log('Storing new calendar keys for account', accountId, envelope, response.secret);
    await putKeysToMaster(accountId, envelope);

    // On ne se fie pas au `ok` : on RELIT ce qui est réellement stocké.
    //  - notre enveloppe → stockage confirmé ;
    //  - une autre enveloppe → un autre onglet a gagné la course : on adopte la sienne ;
    //  - rien → échec : on n'utilise PAS ces clés (tout ce qu'on chiffrerait serait perdu).
    const check = await getDataFromMaster(accountId);
    if (check.state !== 'ok' || !check.data) {
      throw new CalendarCryptoError('STORE_FAILED', 'The master plugin did not confirm storing the new calendar keys.');
    }
    console.log('Calendar keys stored for account', accountId, check.data, check.secret);
    keys = await unlockCalendarKeys(check.secret, check.data);
  } else {
    keys = await unlockCalendarKeys(response.secret, response.data);
  }

  broadcastUnlockKey({ id: accountId, accountId, aesKey: keys.dekAes, hmacKey: keys.dekHmac });
  return keys;
}
