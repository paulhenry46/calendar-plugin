/**
 * Calendar True End-to-End — plugin privilégié (même origine).
 *
 * Chiffre les événements de calendrier côté navigateur. Les clés (AES-GCM + HMAC) sont
 * générées localement, emballées avec un secret fourni par le plugin maître (OpenPGP) et
 * stockées chez lui ; elles ne vivent ici qu'en mémoire, sous forme de CryptoKey non extractibles.
 */
import { SettingsSection } from './ui/settings.tsx';
import { broadcastLockKey, initBackgroundSessionListener } from './crypto/broadcastChannel.ts';
import { onBeforeEventCreate } from './hooks/onBeforeEventCreate.ts';
import { onBeforeUpdateEvent } from './hooks/onBeforeEventUpdate.ts';
import { onBeforeImportEvent } from './hooks/onBeforeEventsImport.ts';
import { onBeforeFetchEvents } from './hooks/onBeforeFetchEvents.ts';
import { onAfterFetchEvent } from './hooks/onAfterFetchEvents.ts';

export const NOT_PRIVILEGED_MSG =
  'Calendar True End-to-End could not start: it is running in the restricted (untrusted) plugin ' +
  'sandbox, where WebCrypto and BroadcastChannel are unavailable. It must be delivered as a signed, ' +
  'admin-approved bundle with "tier": "privileged". Contact your administrator.';

export function isCapable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && typeof BroadcastChannel !== 'undefined';
}

// ⚠ Les clés de ce tableau sont les NOMS DE HOOKS attendus par l'hôte. Ils sont déduits de vos
// noms de fonctions ; à vérifier dans la doc du système de plugins de l'hôte.
export const hooks = {
  onBeforeEventCreate,
  onBeforeEventUpdate: onBeforeUpdateEvent,
  onBeforeEventsImport: onBeforeImportEvent,
  onBeforeFetchEvents,
  onAfterFetchEvents: onAfterFetchEvent,
  // Déconnexion : on ne laisse aucune clé en mémoire (ici et dans les autres onglets).
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
