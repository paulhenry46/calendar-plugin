import { unlockPrivateKey } from "../pgp/import.ts";
import { broadcastUnlockKey } from "../pgp/session-broadcast.ts";
import { getAllDefaultKeyRecords, getDefaultKeyRecord, listKeyRecords } from "../storage.ts";
import host from '@plugin-host';
import { unlockWithWebAuthnRegisteredKeys } from "../webauthn/settings.ts";

export async function askForDefaultKeyPass(type: 'default' | 'all'): Promise<void> {
  let defaultKeys;
  if (type === 'default') {
    defaultKeys = [await getDefaultKeyRecord()];
  } else {
    defaultKeys = await getAllDefaultKeyRecords();
  }
  const allKeys = await listKeyRecords();
  // separate between keys which have webauthn and those which don't
  // for webauthn, because we will decrypt a fisrt time, i think  we can decrypt all webauthn, 
  // even thoses which are not default, because we will use the same prfSecret to decrypt all of them
  const webauthnKeys = allKeys.filter(k => k?.webauthn);
  let nonWebauthnKeys = defaultKeys.filter(k => k && !k.webauthn);

  if (webauthnKeys.length > 0) {
    const result = await host.ui.confirm({
      title: host.i18n.t('prompt.unlock_default_key.webauthn_title'),
      message: host.i18n.t('prompt.unlock_default_key.webauthn_message'),
    });
    if(result){
      await unlockWithWebAuthnRegisteredKeys(webauthnKeys as any, {});
      host.ui.rerenderFetchedEmails();
    }else{
      nonWebauthnKeys = defaultKeys;
    }

  }

  if (nonWebauthnKeys.length === 0) {
    return;
  }

  for (const defaultKey of nonWebauthnKeys) {
    if (!defaultKey) continue;

    const result = await host.ui.prompt({
      title: host.i18n.t('prompt.unlock_default_key.title'),
      message: host.i18n.t('prompt.unlock_default_key.message') + ' ' + defaultKey.email,
      fields: [{ 
        name: 'passphrase', 
        label: host.i18n.t('prompt.unlock_default_key.passphrase_label'), 
        type: 'password', 
        required: true 
      }]
    });
    if (!result || !result.passphrase) {
      return; 
    }

    const unlockPassphrase = result.passphrase;

    try {
      const { unlockedPrivateKey, signingKey, decryptionKey, aesKey, hmacKey } = await unlockPrivateKey(defaultKey, unlockPassphrase);
      
      broadcastUnlockKey({ 
        id: defaultKey.id, 
        unlockedPrivateKey, 
        signingKey, 
        decryptionKey,
        aesKey: aesKey,
        hmacKey: hmacKey,
      });
      host.ui.rerenderFetchedEmails();
    } catch (error) {
      throw new Error('Failed to unlock the default key: ' + (error instanceof Error ? error.message : String(error)));
    }
  }
}