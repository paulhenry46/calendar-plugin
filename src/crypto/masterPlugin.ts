import type { LocalEncryptedEnvelope } from './getKey.ts';

const PLUGIN_STORAGE_SLOT_NAME = 'pgp-calendar-plugin';
const SESSION_HOST_PROP = '__pgpSessionHost';
const SESSION_HOST_METHODS = [
  'setKey',
  'isUnlocked',
  'initIndex',
  'updateIndexEntry',
  'getCustomSecret',
  'addCustomSecret',
] as const;

interface PgpSessionHost {
  isUnlocked(keyId?: string): boolean;
  getCustomSecret(salt: string, accountId: string): Promise<{ secret: string | null; data?: unknown }>;
  addCustomSecret(salt: string, accountId: string, data: unknown): Promise<boolean>;
}

export type MasterReply =
  | { state: 'ok'; secret: string; data: LocalEncryptedEnvelope | undefined }
  | { state: 'locked' }
  | { state: 'unavailable' };

function findPgpSessionHost(): PgpSessionHost | null {
  let frames: any;
  try {
    frames = (globalThis as any).parent?.frames;
  } catch {
    return null;
  }

  const count = Number(frames?.length) || 0;
  for (let i = 0; i < count; i++) {
    try {
      const candidate = frames[i]?.[SESSION_HOST_PROP];
      if (candidate && SESSION_HOST_METHODS.every((name) => typeof candidate[name] === 'function')) {
        return candidate as PgpSessionHost;
      }
    } catch {
      
    }
  }
  return null;
}

export async function getDataFromMaster(accountId: string): Promise<MasterReply> {
  const host = findPgpSessionHost();
  if (!host) {
    return { state: 'unavailable' };
  }

  try {
    const res = await host.getCustomSecret(PLUGIN_STORAGE_SLOT_NAME, accountId);

    if (typeof res?.secret === 'string' && res.secret.length > 0) {
      return {
        state: 'ok',
        secret: res.secret,
        data: toEnvelope(res.data),
      };
    }

    return { state: 'locked' };
  } catch (err) {
    console.error('[pgp-calendar-plugin] Failed to get custom secret from master:', err);
    return { state: 'unavailable' };
  }
}

export async function putKeysToMaster(accountId: string, envelope: LocalEncryptedEnvelope): Promise<boolean> {
  const host = findPgpSessionHost();
  if (!host) {
    return false;
  }

  try {
    return await host.addCustomSecret(PLUGIN_STORAGE_SLOT_NAME, accountId, envelope);
  } catch (err) {
    console.error('[pgp-calendar-plugin] Failed to put keys to master:', err);
    return false;
  }
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