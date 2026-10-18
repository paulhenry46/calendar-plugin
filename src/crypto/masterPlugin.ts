import type { LocalEncryptedEnvelope } from './getKey.ts';

/**
 * Protocole avec le plugin maître (OpenPGP), via BroadcastChannel :
 *   → { type: 'REQUEST_CUSTOM_SECRET', requestId, salt, accountId, data? }
 *   ← { type: 'RESPONSE_CUSTOM_SECRET', requestId, secret, data?, ok? }
 * Sans `data`, le maître renvoie le secret dérivé pour (salt, accountId) et l'enveloppe stockée
 * (undefined si aucune). Avec `data`, il stocke l'enveloppe et répond `ok`.
 * Le maître ne répond pas s'il est verrouillé / absent → timeout.
 */
const CHANNEL_NAME = 'pgp-session-bus';
const PLUGIN_STORAGE_SLOT_NAME = 'pgp-calendar-plugin';
const MASTER_TIMEOUT_MS = 1500;

function requestMaster<T>(
  accountId: string,
  payload: Record<string, unknown>,
  pick: (data: any) => T,
  onTimeout: T
): Promise<T> {
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const requestId = crypto.randomUUID();

    const timeout = setTimeout(() => {
      channel.close();
      resolve(onTimeout);
    }, MASTER_TIMEOUT_MS);

    channel.onmessage = (event: MessageEvent<any>) => {
      if (event.data?.type === 'RESPONSE_CUSTOM_SECRET' && event.data.requestId === requestId) {
        clearTimeout(timeout);
        channel.close();
        resolve(pick(event.data));
      }
    };

    channel.postMessage({
      type: 'REQUEST_CUSTOM_SECRET',
      requestId,
      salt: PLUGIN_STORAGE_SLOT_NAME,
      accountId,
      ...payload,
    });
  });
}

export function getDataFromMaster(
  accountId: string
): Promise<{ data: LocalEncryptedEnvelope | undefined; secret: string } | undefined> {
  return requestMaster(
    accountId,
    {},
    (d) => ({ data: d.data as LocalEncryptedEnvelope | undefined, secret: d.secret as string }),
    undefined
  );
}

/** Demande au maître de stocker l'enveloppe. Résout true uniquement sur confirmation explicite. */
export function putKeysToMaster(accountId: string, envelope: LocalEncryptedEnvelope): Promise<boolean> {
  return requestMaster(accountId, { data: envelope }, (d) => d.ok === true, false);
}
