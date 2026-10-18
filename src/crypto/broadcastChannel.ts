import type { SessionKeysEntry } from '../types.ts';

const CHANNEL_NAME = 'calendar-session-bus';
const REQUEST_TIMEOUT_MS = 300;

/**
 * Clés déverrouillées de la session, en mémoire uniquement (jamais persistées).
 * Indexées par `SessionKeysEntry.id` (= accountId).
 * Les CryptoKey non extractibles sont clonables par structured clone : on peut donc les
 * partager entre onglets via BroadcastChannel sans jamais exposer le matériel brut.
 */
let _sessionKeys: Record<string, SessionKeysEntry> = {};

type SessionMessage =
  | { type: 'PING_STATUS'; requestId: string }
  | { type: 'PONG_STATUS'; requestId: string; isUnlocked: boolean }
  | { type: 'SET_KEY'; keyEntry: SessionKeysEntry }
  | { type: 'KEY_UPDATED'; isUnlocked: boolean }
  | { type: 'CLEAR_KEY'; id: string } // id vide => tout effacer
  | { type: 'REQUEST_KEY_DATA'; requestId: string; keyId: string }
  | { type: 'RESPONSE_KEY_DATA'; requestId: string; keyEntry: SessionKeysEntry | null };

const newRequestId = () => crypto.randomUUID();
const hasAnyKey = () => Object.keys(_sessionKeys).length > 0;

let listenerChannel: BroadcastChannel | null = null;

/** À appeler une fois à l'activation du plugin. Idempotent. */
export function initBackgroundSessionListener(): void {
  if (listenerChannel) return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  listenerChannel = channel;

  channel.onmessage = (event: MessageEvent<SessionMessage>) => {
    const msg = event.data;
    switch (msg.type) {
      case 'PING_STATUS':
        channel.postMessage({ type: 'PONG_STATUS', requestId: msg.requestId, isUnlocked: hasAnyKey() });
        break;

      case 'SET_KEY':
        if (msg.keyEntry?.id && msg.keyEntry.aesKey && msg.keyEntry.hmacKey) {
          _sessionKeys[msg.keyEntry.id] = msg.keyEntry;
          channel.postMessage({ type: 'KEY_UPDATED', isUnlocked: true });
        }
        break;

      case 'CLEAR_KEY':
        if (msg.id) {
          delete _sessionKeys[msg.id];
        } else {
          _sessionKeys = {};
        }
        channel.postMessage({ type: 'KEY_UPDATED', isUnlocked: hasAnyKey() });
        break;

      case 'REQUEST_KEY_DATA': {
        // On ne répond que si on possède la clé : sinon un onglet "vide" pourrait
        // répondre null avant un onglet qui l'a.
        const keyEntry = _sessionKeys[msg.keyId];
        if (keyEntry) {
          channel.postMessage({ type: 'RESPONSE_KEY_DATA', requestId: msg.requestId, keyEntry });
        }
        break;
      }
    }
  };
}

export function closeBackgroundSessionListener(): void {
  listenerChannel?.close();
  listenerChannel = null;
}

// ─── Accès local (synchrone) ────────────────────────────────────────────

export function getBackgroundSessionKey(id: string): SessionKeysEntry | null {
  return _sessionKeys[id] || null;
}

export function isUnlockedLocally(accountId?: string): boolean {
  return accountId ? !!_sessionKeys[accountId] : hasAnyKey();
}

// ─── Accès inter-onglets ────────────────────────────────────────────────

/** Demande la clé aux autres onglets. Résout au premier onglet qui l'a, sinon null après timeout. */
export function fetchKeyFromBackground(accountId: string): Promise<SessionKeysEntry | null> {
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const requestId = newRequestId();

    const timeout = setTimeout(() => {
      channel.close();
      resolve(null);
    }, REQUEST_TIMEOUT_MS);

    channel.onmessage = (event: MessageEvent<SessionMessage>) => {
      const msg = event.data;
      if (msg.type === 'RESPONSE_KEY_DATA' && msg.requestId === requestId && msg.keyEntry) {
        clearTimeout(timeout);
        channel.close();
        resolve(msg.keyEntry);
      }
    };

    channel.postMessage({ type: 'REQUEST_KEY_DATA', requestId, keyId: accountId } satisfies SessionMessage);
  });
}

/** true si au moins un onglet (ou celui-ci) détient une clé. */
export async function checkIsKeyUnlocked(): Promise<boolean> {
  if (hasAnyKey()) return true;
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const requestId = newRequestId();

    const timeout = setTimeout(() => {
      channel.close();
      resolve(false);
    }, REQUEST_TIMEOUT_MS);

    channel.onmessage = (event: MessageEvent<SessionMessage>) => {
      const msg = event.data;
      if (msg.type === 'PONG_STATUS' && msg.requestId === requestId && msg.isUnlocked) {
        clearTimeout(timeout);
        channel.close();
        resolve(true);
      }
    };

    channel.postMessage({ type: 'PING_STATUS', requestId } satisfies SessionMessage);
  });
}

/** Mémorise la clé localement (effet immédiat) puis la diffuse aux autres onglets. */
export function broadcastUnlockKey(keyEntry: SessionKeysEntry): void {
  _sessionKeys[keyEntry.id] = keyEntry;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type: 'SET_KEY', keyEntry } satisfies SessionMessage);
  channel.close();
}

/** Efface la clé `keyId` (ou toutes si omis), ici et dans les autres onglets. */
export function broadcastLockKey(keyId?: string): void {
  if (keyId) delete _sessionKeys[keyId];
  else _sessionKeys = {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type: 'CLEAR_KEY', id: keyId ?? '' } satisfies SessionMessage);
  channel.close();
}

export function subscribeToKeyUpdates(callback: (isUnlocked: boolean) => void): () => void {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<SessionMessage>) => {
    if (event.data.type === 'KEY_UPDATED') callback(event.data.isUnlocked);
  };
  return () => channel.close();
}
