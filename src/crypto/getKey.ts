import { fetchKeyFromBackground } from "./broadcastChannel.ts";
import { base64ToBuffer, bufferToBase64 } from "./encrypt.ts";
import { getDataFromMaster } from "./masterPlugin.ts";
export interface LocalEncryptedEnvelope {
  iv: string;
  wrappedKeys: string;
}

export async function importSecretAsKek(secretFromPluginA: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  
  const rawKey = await crypto.subtle.digest('SHA-256', encoder.encode(secretFromPluginA));

  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt', 'encrypt']
  );
}

export async function unlockCalendarKeys(
  secretFromPluginA: string,
  envelope: LocalEncryptedEnvelope
): Promise<{ dekAes: CryptoKey; dekHmac: CryptoKey }> {
  const kek = await importSecretAsKek(secretFromPluginA);

  const iv = base64ToBuffer(envelope.iv);
  const encryptedData = base64ToBuffer(envelope.wrappedKeys);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    kek,
    encryptedData as  BufferSource
  );

  const decryptedText = new TextDecoder().decode(decryptedBuffer);
  const keysPayload: { rawAes: string; rawHmac: string } = JSON.parse(decryptedText);

  const dekAes = await crypto.subtle.importKey(
    'raw',
    base64ToBuffer(keysPayload.rawAes) as BufferSource,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const dekHmac = await crypto.subtle.importKey(
    'raw',
    base64ToBuffer(keysPayload.rawHmac) as BufferSource ,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );

  return { dekAes, dekHmac };
}

export async function getKeys(accountId: string): Promise<{ dekAes: CryptoKey; dekHmac: CryptoKey } | undefined> {
  const entry = await fetchKeyFromBackground(accountId);
  if (!entry) {
  const response = await getDataFromMaster(accountId);
  if(response === undefined){
    throw new Error("Error when communicating with the master plugin. Please ensure that the master plugin is installed and running.");
  }
  if(response.data === undefined){
    // No keys found for this accountId in the master plugin
    // we must generate them.
    throw new Error("No keys found for this accountId in the master plugin. Please ensure that the master plugin has generated keys for this account.");
  }
   return unlockCalendarKeys(response.secret, response.data);
  }else{
    return { dekAes: entry.aesKey, dekHmac: entry.hmacKey };
  }
}


export async function generateAndWrapCalendarKeys(
  secretFromPluginA: string
): Promise<LocalEncryptedEnvelope> {
  const kek = await importSecretAsKek(secretFromPluginA);

  const dekAes = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const dekHmac = await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    true, // extractable
    ['sign', 'verify']
  );

  const rawAes = await crypto.subtle.exportKey('raw', dekAes);
  const rawHmac = await crypto.subtle.exportKey('raw', dekHmac);

  const payload = JSON.stringify({
    rawAes: bufferToBase64(rawAes),
    rawHmac: bufferToBase64(rawHmac),
  });

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    new TextEncoder().encode(payload)
  );

  return {
    iv: bufferToBase64(iv.buffer),
    wrappedKeys: bufferToBase64(encryptedBuffer),
  };
}