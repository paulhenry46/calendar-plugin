import type { LocalEncryptedEnvelope } from './getKey.ts';

/**
 * Protocole avec le plugin maître (OpenPGP), canal 'pgp-session-bus' :
 *
 *   LIRE      → { type: 'REQUEST_CUSTOM_SECRET', requestId, salt, accountId }
 *             ← { type: 'RESPONSE_CUSTOM_SECRET', requestId, secret, data }
 *       - maître déverrouillé : secret = string, data = enveloppe ou undefined
 *       - maître verrouillé   : secret = null (réponse immédiate)
 *       - aucune clé par défaut pour ce compte : le maître ne répond PAS (timeout)
 *
 *   ÉCRIRE    → { type: 'REQUEST_ADD_CUSTOM_SECRET', requestId, salt, accountId, data }
 *             ← { type: 'RESPONSE_ADD_CUSTOM_SECRET', requestId, ok }
 *
 * Plusieurs onglets = plusieurs écouteurs maîtres qui répondent tous : on ne se fie donc
 * jamais à la première réponse "négative".
 */
const CHANNEL_NAME = 'pgp-session-bus';
const PLUGIN_STORAGE_SLOT_NAME = 'pgp-calendar-plugin';
const MASTER_TIMEOUT_MS = 1500;
/** Après une réponse négative, on laisse ce délai aux autres onglets pour répondre mieux. */
const GRACE_AFTER_NEGATIVE_MS = 400;

export type MasterReply =
  | { state: 'ok'; secret: string; data: LocalEncryptedEnvelope | undefined }
  | { state: 'locked' } // le maître répond mais sa clé par défaut n'est pas déverrouillée
  | { state: 'unavailable' }; // pas de réponse : absent, ou pas de clé par défaut pour ce compte

export function getDataFromMaster(accountId: string): Promise<MasterReply> {
  console.log('Requesting keys from master for accountId:', accountId);
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const requestId = crypto.randomUUID();
    let sawLocked = false;
    let timer: ReturnType<typeof setTimeout>;

    const finish = (reply: MasterReply) => {
      clearTimeout(timer);
      channel.close();
      resolve(reply);
    };
    const finishNegative = () => finish(sawLocked ? { state: 'locked' } : { state: 'unavailable' });

    timer = setTimeout(finishNegative, MASTER_TIMEOUT_MS);

    channel.onmessage = (event: MessageEvent<any>) => {
      const d = event.data;
      if (d?.type !== 'RESPONSE_CUSTOM_SECRET' || d.requestId !== requestId) return;

      if (typeof d.secret === 'string' && d.secret.length > 0) {
        finish({ state: 'ok', secret: d.secret, data: toEnvelope(d.data) });
      } else if (!sawLocked) {
        // secret null = onglet maître verrouillé. Un autre onglet peut être déverrouillé.
        sawLocked = true;
        clearTimeout(timer);
        timer = setTimeout(finishNegative, GRACE_AFTER_NEGATIVE_MS);
      }
    };

    channel.postMessage({ type: 'REQUEST_CUSTOM_SECRET', requestId, salt: PLUGIN_STORAGE_SLOT_NAME, accountId });
  });
}

/**
 * Demande au maître de stocker l'enveloppe. true uniquement sur `ok: true` explicite.
 * Un `ok: false` peut venir d'un onglet qui a perdu une course : l'appelant doit relire
 * (getDataFromMaster) pour savoir ce qui est réellement stocké.
 */
export function putKeysToMaster(accountId: string, envelope: LocalEncryptedEnvelope): Promise<boolean> {
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const requestId = crypto.randomUUID();
    let timer: ReturnType<typeof setTimeout>;

    const finish = (ok: boolean) => {
      clearTimeout(timer);
      channel.close();
      resolve(ok);
    };
    timer = setTimeout(() => finish(false), MASTER_TIMEOUT_MS);

    channel.onmessage = (event: MessageEvent<any>) => {
      const d = event.data;
      if (d?.type !== 'RESPONSE_ADD_CUSTOM_SECRET' || d.requestId !== requestId) return;
      if (d.ok === true) finish(true);
      else {
        clearTimeout(timer);
        timer = setTimeout(() => finish(false), GRACE_AFTER_NEGATIVE_MS);
      }
    };

    channel.postMessage({
      type: 'REQUEST_ADD_CUSTOM_SECRET',
      requestId,
      salt: PLUGIN_STORAGE_SLOT_NAME,
      accountId,
      data: envelope,
    });
  });
}

/**
 * The master may return either the envelope itself or its storage record
 * ({ id, data: envelope, accountId }). Normalize to the envelope.
 */
function toEnvelope(raw: unknown): LocalEncryptedEnvelope | undefined {
  if (raw == null) return undefined;
  const r = raw as any;
  if (typeof r.iv === 'string' && typeof r.wrappedKeys === 'string') return r;
  if (typeof r.data?.iv === 'string' && typeof r.data?.wrappedKeys === 'string') return r.data;
  // Unknown shape: let the unwrap fail loudly. Returning undefined here would be read as
  // "no keys yet" and could lead to generating new keys over existing data.
  return r;
}