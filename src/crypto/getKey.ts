import { base64ToBuffer } from "./encrypt.ts";
export interface LocalEncryptedEnvelope {
  iv: string;         
  wrappedKeys: string;
}

async function importSecretAsKek(secretFromPluginA: string): Promise<CryptoKey> {
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