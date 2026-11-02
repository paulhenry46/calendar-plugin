import { SettingsSection } from './ui/settings.tsx';
import { broadcastLockKey, initBackgroundSessionListener } from './crypto/broadcastChannel.ts';
import { onCreatingEvent } from './hooks/onCreatingEvent.ts';
import { onUpdatingEvent } from './hooks/onUpdatingEvent.ts';
import { onBeforeImportEvent } from './hooks/onBeforeEventsImport.ts';
import { onBeforeFetchEvents } from './hooks/onBeforeFetchEvents.ts';
import { onFetchingEvents } from './hooks/onFetchingEvents.ts';

export const NOT_PRIVILEGED_MSG =
  'Calendar True End-to-End could not start: it is running in the restricted (untrusted) plugin ' +
  'sandbox, where WebCrypto and BroadcastChannel are unavailable. It must be delivered as a signed, ' +
  'admin-approved bundle with "tier": "privileged". Contact your administrator.';

export function isCapable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && typeof BroadcastChannel !== 'undefined';
}

export const hooks = {
  onCreatingEvent,
  onUpdatingEvent,
  onBeforeEventsImport: onBeforeImportEvent,
  onBeforeFetchEvents,
  onFetchingEvents,
  async onAfterLogout() {
    broadcastLockKey();
  },
};

export const slots = {
  'settings-section': { component: SettingsSection, order: 110 },
};

export async function activate(api: any) {
  if (!isCapable()) {
    api.log.error(NOT_PRIVILEGED_MSG);
    try {
      api.toast.error('Calendar encryption needs the privileged tier — see plugin logs.');
    } catch {
      /* ignore */
    }
    return;
  }
  initBackgroundSessionListener();
  api.log.info('Calendar True End-to-End activated (keys are kept in memory only).');
}
