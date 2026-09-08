
async function importTransportedSecret(
  secret: string,
  algorithm: AlgorithmIdentifier | AesKeyAlgorithm = { name: 'AES-GCM', length: 256 },
  keyUsages: KeyUsage[] = ['encrypt', 'decrypt']
): Promise<CryptoKey> {
  let secretBuffer: Uint8Array;
    secretBuffer = new TextEncoder().encode(secret);
  return await window.crypto.subtle.importKey(
    'raw',
    secretBuffer as BufferSource,
    algorithm,
    false, 
    keyUsages
  );
}

export function getKeyFromSecret(secret: string): Promise<CryptoKey> {
  return importTransportedSecret(secret, { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']);
}