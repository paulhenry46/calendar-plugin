import type { LocalEncryptedEnvelope } from './getKey.ts';

const CHANNEL_NAME = 'pgp-session-bus';
const PLUGIN_STORAGE_SLOT_NAME = 'pgp-calendar-plugin';
const MASTER_TIMEOUT_MS = 1500;

const GRACE_AFTER_NEGATIVE_MS = 400;

export type MasterReply =
  | { state: 'ok'; secret: string; data: LocalEncryptedEnvelope | undefined }
  | { state: 'locked' }
  | { state: 'unavailable' };

export function getDataFromMaster(accountId: string): Promise<MasterReply> {
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
        sawLocked = true;
        clearTimeout(timer);
        timer = setTimeout(finishNegative, GRACE_AFTER_NEGATIVE_MS);
      }
    };

    channel.postMessage({ type: 'REQUEST_CUSTOM_SECRET', requestId, salt: PLUGIN_STORAGE_SLOT_NAME, accountId });
  });
}

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