import type { SessionKeysEntry } from '../types.ts';

const CHANNEL_NAME = 'calendar-session-bus';
const SESSION_HOST_PROP = '__calendarSessionHost';
const SESSION_HOST_METHODS = ['setKey', 'isUnlocked'] as const;

let _isSessionHost = false;
let _sessionKeys: Record<string, SessionKeysEntry> = {};

interface CalendarSessionHost {
  setKey(keyEntry: SessionKeysEntry): void;
  isUnlocked(id?: string): boolean;
}

type SessionMessage =
  | { type: 'KEY_UPDATED'; isUnlocked: boolean }
  | { type: 'CLEAR_KEY'; id: string };

const hasAnyKey = () => Object.keys(_sessionKeys).length > 0;

let listenerChannel: BroadcastChannel | null = null;

function notifyKeyUpdated(isUnlocked: boolean): void {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type: 'KEY_UPDATED', isUnlocked } satisfies SessionMessage);
  channel.close();
}

function findCalendarSessionHost(): CalendarSessionHost | null {
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
        return candidate as CalendarSessionHost;
      }
    } catch {
    
    }
  }
  return null;
}

export function initBackgroundSessionListener(): void {
  if (listenerChannel) return;
  _isSessionHost = true;

  const sessionHost: CalendarSessionHost = Object.freeze({
    setKey(keyEntry: SessionKeysEntry) {
      if (keyEntry?.id && keyEntry.aesKey && keyEntry.hmacKey) {
        _sessionKeys[keyEntry.id] = structuredClone(keyEntry);
        notifyKeyUpdated(true);
      }
    },
    isUnlocked(id?: string): boolean {
      return id ? !!_sessionKeys[id] : hasAnyKey();
    },
  });

  Object.defineProperty(globalThis, SESSION_HOST_PROP, {
    value: sessionHost,
    configurable: true,
  });

  const channel = new BroadcastChannel(CHANNEL_NAME);
  listenerChannel = channel;

  channel.onmessage = (event: MessageEvent<SessionMessage>) => {
    const msg = event.data;
    if (msg.type === 'CLEAR_KEY') {
      if (msg.id) {
        delete _sessionKeys[msg.id];
      } else {
        _sessionKeys = {};
      }
      channel.postMessage({ type: 'KEY_UPDATED', isUnlocked: hasAnyKey() } satisfies SessionMessage);
    }
  };
}

export function closeBackgroundSessionListener(): void {
  listenerChannel?.close();
  listenerChannel = null;
  _isSessionHost = false;
  _sessionKeys = {};
}


export function getBackgroundSessionKey(id: string): SessionKeysEntry | null {
  return _isSessionHost ? (_sessionKeys[id] || null) : null;
}

/** true if the tab holds a key. */
export async function isCalendarKeyUnlocked(accountId?: string): Promise<boolean> {
  if (_isSessionHost) {
    return accountId ? !!_sessionKeys[accountId] : hasAnyKey();
  }
  return findCalendarSessionHost()?.isUnlocked(accountId) ?? false;
}


export function broadcastUnlockKey(keyEntry: SessionKeysEntry): void {
  if (_isSessionHost) {
    _sessionKeys[keyEntry.id] = keyEntry;
    notifyKeyUpdated(true);
    return;
  }

  const host = findCalendarSessionHost();
  if (!host) {
    console.warn('[Calendar] No background frame found in this tab: key not stored.');
    return;
  }
  host.setKey(keyEntry);
}

/** Effectively lock the key `keyId` (or all if omitted), here and in the other tabs. */
export function broadcastLockKey(keyId?: string): void {
  if (_isSessionHost) {
    if (keyId) delete _sessionKeys[keyId];
    else _sessionKeys = {};
    notifyKeyUpdated(hasAnyKey());
    return;
  }


  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type: 'CLEAR_KEY', id: keyId ?? '' } satisfies SessionMessage);
  channel.close();
}

export async function fetchKeyFromBackground(accountId: string): Promise<boolean> {
  if (_isSessionHost) {
    return !!_sessionKeys[accountId];
  }
  return findCalendarSessionHost()?.isUnlocked(accountId) ?? false;
}

export function subscribeToKeyUpdates(callback: (isUnlocked: boolean) => void): () => void {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<SessionMessage>) => {
    if (event.data.type === 'KEY_UPDATED') callback(event.data.isUnlocked);
  };
  return () => channel.close();
}
