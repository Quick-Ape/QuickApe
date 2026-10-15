import { base64 } from '@scure/base';

/**
 * Encrypted vault: PBKDF2-SHA256 (600k iterations) -> AES-256-GCM.
 * Only the ciphertext is stored in chrome.storage.local.
 */
export interface EncryptedVault {
  v: 1;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

const ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

// Copy into a fresh ArrayBuffer so it matches WebCrypto's BufferSource type.
const buf = (b: Uint8Array): ArrayBuffer => b.slice().buffer;

export async function deriveKey(password: string, salt: Uint8Array, iter = ITERATIONS): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations: iter },
    base,
    { name: 'AES-GCM', length: 256 },
    true, // extractable: the raw key is kept in storage.session while the wallet is unlocked
    ['encrypt', 'decrypt'],
  );
}

export async function encryptWithKey<T>(data: T, key: CryptoKey, salt: Uint8Array, iter = ITERATIONS): Promise<EncryptedVault> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv) }, key, enc.encode(JSON.stringify(data))),
  );
  return { v: 1, iter, salt: base64.encode(salt), iv: base64.encode(iv), ct: base64.encode(ct) };
}

export async function createVault<T>(data: T, password: string): Promise<{ vault: EncryptedVault; key: CryptoKey }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(password, salt);
  return { vault: await encryptWithKey(data, key, salt), key };
}

export async function decryptWithKey<T>(vault: EncryptedVault, key: CryptoKey): Promise<T> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf(base64.decode(vault.iv)) },
    key,
    buf(base64.decode(vault.ct)),
  );
  return JSON.parse(dec.decode(plain)) as T;
}

/** Open the vault with a password. Throws if the password is wrong. */
export async function openVault<T>(vault: EncryptedVault, password: string): Promise<{ data: T; key: CryptoKey }> {
  const key = await deriveKey(password, base64.decode(vault.salt), vault.iter);
  try {
    return { data: await decryptWithKey<T>(vault, key), key };
  } catch {
    throw new Error('Incorrect password');
  }
}

export async function exportKey(key: CryptoKey): Promise<string> {
  return base64.encode(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

export async function importKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', buf(base64.decode(raw)), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}
