/**
 * Envelope encryption for secret values.
 *
 * Scheme (see docs/ARCHITECTURE.md):
 *   - KEK  : 256-bit key-encryption key, provided as base64 (Worker secret MASTER_KEK).
 *   - DEK  : fresh random 256-bit data-encryption key per secret *version*.
 *   - value      = AES-256-GCM(DEK, ivValue, plaintext, aad = secretName)
 *   - wrappedDek = AES-256-GCM(KEK, ivDek,   dekRaw,    aad = "akv:dek:v1")
 *
 * D1 stores only the sealed fields below — never plaintext, never the raw DEK.
 * A leak of D1 (or its backups) without the KEK reveals nothing.
 */

const GCM = "AES-GCM";
const KEY_BITS = 256;
const IV_BYTES = 12; // 96-bit nonce, the GCM standard
const DEK_AAD = new TextEncoder().encode("akv:dek:v1");

/** The at-rest representation of an encrypted secret value. All fields base64. */
export interface SealedSecret {
  ciphertext: string;
  ivValue: string;
  wrappedDek: string;
  ivDek: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function randomBytes(len: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(len));
}

/** Generate a fresh KEK, returned as base64 — use once during setup. */
export function generateKekBase64(): string {
  return toBase64(randomBytes(KEY_BITS / 8));
}

/** Import a base64 KEK for wrapping/unwrapping DEKs. */
export async function loadKek(kekBase64: string): Promise<CryptoKey> {
  const raw = fromBase64(kekBase64);
  if (raw.length !== KEY_BITS / 8) {
    throw new Error(`MASTER_KEK must be ${KEY_BITS / 8} bytes (got ${raw.length})`);
  }
  return crypto.subtle.importKey("raw", raw, { name: GCM }, false, [
    "encrypt",
    "decrypt"
  ]);
}

async function importDek(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: GCM }, false, [
    "encrypt",
    "decrypt"
  ]);
}

/** Encrypt `plaintext`, binding it to `secretName` as additional authenticated data. */
export async function seal(
  plaintext: string,
  secretName: string,
  kek: CryptoKey
): Promise<SealedSecret> {
  const dekRaw = randomBytes(KEY_BITS / 8);
  const dek = await importDek(dekRaw);

  const ivValue = randomBytes(IV_BYTES);
  const aad = new TextEncoder().encode(secretName);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: GCM, iv: ivValue, additionalData: aad },
      dek,
      new TextEncoder().encode(plaintext)
    )
  );

  const ivDek = randomBytes(IV_BYTES);
  const wrappedDek = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: GCM, iv: ivDek, additionalData: DEK_AAD },
      kek,
      dekRaw
    )
  );

  return {
    ciphertext: toBase64(ciphertext),
    ivValue: toBase64(ivValue),
    wrappedDek: toBase64(wrappedDek),
    ivDek: toBase64(ivDek)
  };
}

/** Decrypt a {@link SealedSecret}. `secretName` must match the value used in {@link seal}. */
export async function open(
  sealed: SealedSecret,
  secretName: string,
  kek: CryptoKey
): Promise<string> {
  const dekRaw = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: GCM, iv: fromBase64(sealed.ivDek), additionalData: DEK_AAD },
      kek,
      fromBase64(sealed.wrappedDek)
    )
  );
  const dek = await importDek(dekRaw);

  const aad = new TextEncoder().encode(secretName);
  const plaintext = await crypto.subtle.decrypt(
    { name: GCM, iv: fromBase64(sealed.ivValue), additionalData: aad },
    dek,
    fromBase64(sealed.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}
