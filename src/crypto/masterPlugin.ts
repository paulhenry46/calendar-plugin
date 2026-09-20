import { generateAndWrapCalendarKeys, importSecretAsKek, LocalEncryptedEnvelope } from "./getKey.ts";

// ask passphrase and also the LocalEncryptedEnvelope
const CHANNEL_NAME = 'pgp-session-bus';
const PLUGIN_STORAGE_SLOT_NAME = 'pgp-calendar-plugin';

export function getDataFromMaster(accountId: string): Promise<{data: LocalEncryptedEnvelope | undefined; secret: string} | undefined> {
  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const requestId = Math.random().toString(36).substring(2);

    const timeout = setTimeout(() => {
      channel.close();
      resolve(undefined);
    }, 300);

    channel.onmessage = (event: MessageEvent<any>) => {
      if (event.data.type === 'RESPONSE_CUSTOM_SECRET' && event.data.requestId === requestId) {
        clearTimeout(timeout);
        channel.close();
        resolve({data : event.data.data, secret: event.data.secret});
      }
    };

    channel.postMessage({ type: 'REQUEST_CUSTOM_SECRET', requestId, salt: PLUGIN_STORAGE_SLOT_NAME, accountId });
  });
}

export async function putKeysToMaster(accountId: string, secret: string): Promise<boolean> {
    const envelope = await generateAndWrapCalendarKeys(secret);


  return new Promise((resolve) => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const requestId = Math.random().toString(36).substring(2);

    const timeout = setTimeout(() => {
      channel.close();
      resolve(false);
    }, 300);

    channel.onmessage = (event: MessageEvent<any>) => {
      if (event.data.type === 'RESPONSE_CUSTOM_SECRET' && event.data.requestId === requestId) {
        clearTimeout(timeout);
        channel.close();
        resolve(event.data.ok);
      }
    };

    channel.postMessage({ type: 'REQUEST_CUSTOM_SECRET', requestId, salt: PLUGIN_STORAGE_SLOT_NAME, accountId, data: envelope });
  });
}