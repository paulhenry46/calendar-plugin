export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function encryptString(text: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // IV de 12 octets pour AES-GCM

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);

  return bufferToBase64(combined.buffer);
}

export async function decryptString(encryptedBase64: string, key: CryptoKey): Promise<string> {
  const combined = base64ToBuffer(encryptedBase64);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return new TextDecoder().decode(decryptedBuffer);
}


export async function generateMonthIndex(
  yearMonth: string, // Format "YYYY-MM"
  indexKey: CryptoKey// HMAC key!
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(yearMonth);

  const signature = await crypto.subtle.sign(
    'HMAC',
    indexKey,
    data
  );

  return bufferToBase64(signature);
}