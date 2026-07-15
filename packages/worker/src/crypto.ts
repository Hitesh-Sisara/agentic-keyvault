/**
 * Envelope encryption for secret values, with a versioned KEK key-ring.
 *
 * Scheme (see docs/ARCHITECTURE.md):
 *   - KEK  : 256-bit key-encryption key. The ACTIVE key is `MASTER_KEK`; its
 *            version number is `KEK_VERSION` (default 1). Retired keys are kept
 *            available for decryption as `MASTER_KEK_V<n>` until re-wrapping is
 *            complete.
 *   - DEK  : fresh random 256-bit data-encryption key per secret *version*.
 *   - value      = AES-256-GCM(DEK, ivValue, plaintext, aad = secretName)
 *   - wrappedDek = AES-256-GCM(KEK, ivDek,   dekRaw,    aad = "akv:dek:v1")
 *
 * D1 stores only the sealed fields + the kek version that wrapped the DEK.
 * KEK rotation re-wraps DEKs (cheap) without re-encrypting values.
 */

const GCM = "AES-GCM";
const KEY_BYTES = 32; // 256-bit
const IV_BYTES = 12; // 96-bit GCM nonce
const DEK_AAD = new TextEncoder().encode("akv:dek:v1");

export interface SealedSecret {
  ciphertext: string;
  ivValue: string;
  wrappedDek: string;
  ivDek: string;
}

export interface Keyring {
  active: number;
  keys: Map<number, CryptoKey>;
}

export type KeyringEnv = {
  MASTER_KEK: string;
  KEK_VERSION?: string;
} & Record<string, unknown>;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(len: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(len));
}

/** Generate a fresh KEK, returned as base64 — use once during setup or rotation. */
export function generateKekBase64(): string {
  return toBase64(randomBytes(KEY_BYTES));
}

async function importAesKey(kekBase64: string): Promise<CryptoKey> {
  const raw = fromBase64(kekBase64);
  if (raw.length !== KEY_BYTES) {
    throw new Error(`KEK must be ${KEY_BYTES} bytes (got ${raw.length})`);
  }
  return crypto.subtle.importKey("raw", raw, { name: GCM }, false, ["encrypt", "decrypt"]);
}

// Immutable per-deployment config, safe to cache across requests within an isolate.
const keyringCache = new Map<string, Keyring>();

/** Build the KEK key-ring from environment (active key + any retired keys). */
export async function loadKeyring(env: KeyringEnv): Promise<Keyring> {
  const active = Number(env.KEK_VERSION ?? "1");
  if (!Number.isInteger(active) || active < 1) {
    throw new Error(`invalid KEK_VERSION: ${env.KEK_VERSION}`);
  }

  const cacheKey = `${active}|${env.MASTER_KEK}`;
  const cached = keyringCache.get(cacheKey);
  if (cached) return cached;

  const keys = new Map<number, CryptoKey>();
  keys.set(active, await importAesKey(env.MASTER_KEK));
  for (const [name, value] of Object.entries(env)) {
    if (typeof value !== "string") continue;
    const match = name.match(/^MASTER_KEK_V(\d+)$/);
    if (match) keys.set(Number(match[1]), await importAesKey(value));
  }

  const keyring: Keyring = { active, keys };
  keyringCache.set(cacheKey, keyring);
  return keyring;
}

function kekFor(keyring: Keyring, version: number): CryptoKey {
  const key = keyring.keys.get(version);
  if (!key) throw new Error(`KEK version ${version} is not available to decrypt this secret`);
  return key;
}

async function importDek(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: GCM }, false, ["encrypt", "decrypt"]);
}

/** Encrypt `plaintext`, wrapping the DEK with the active KEK. */
export async function sealValue(
  plaintext: string,
  secretName: string,
  keyring: Keyring
): Promise<{ sealed: SealedSecret; kekVersion: number }> {
  const dekRaw = randomBytes(KEY_BYTES);
  const dek = await importDek(dekRaw);

  const ivValue = randomBytes(IV_BYTES);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: GCM, iv: ivValue, additionalData: new TextEncoder().encode(secretName) },
      dek,
      new TextEncoder().encode(plaintext)
    )
  );

  const ivDek = randomBytes(IV_BYTES);
  const wrappedDek = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: GCM, iv: ivDek, additionalData: DEK_AAD },
      kekFor(keyring, keyring.active),
      dekRaw
    )
  );

  return {
    sealed: {
      ciphertext: toBase64(ciphertext),
      ivValue: toBase64(ivValue),
      wrappedDek: toBase64(wrappedDek),
      ivDek: toBase64(ivDek)
    },
    kekVersion: keyring.active
  };
}

/** Decrypt a sealed value. `kekVersion` selects which KEK unwraps the DEK. */
export async function openValue(
  sealed: SealedSecret,
  secretName: string,
  keyring: Keyring,
  kekVersion: number
): Promise<string> {
  const dekRaw = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: GCM, iv: fromBase64(sealed.ivDek), additionalData: DEK_AAD },
      kekFor(keyring, kekVersion),
      fromBase64(sealed.wrappedDek)
    )
  );
  const dek = await importDek(dekRaw);
  const plaintext = await crypto.subtle.decrypt(
    { name: GCM, iv: fromBase64(sealed.ivValue), additionalData: new TextEncoder().encode(secretName) },
    dek,
    fromBase64(sealed.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * Re-wrap a DEK from `fromVersion` to the active KEK, without touching the
 * value ciphertext. Returns the new wrapped DEK fields and active version.
 */
export async function rewrapDek(
  sealed: Pick<SealedSecret, "wrappedDek" | "ivDek">,
  keyring: Keyring,
  fromVersion: number
): Promise<{ wrappedDek: string; ivDek: string; kekVersion: number }> {
  const dekRaw = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: GCM, iv: fromBase64(sealed.ivDek), additionalData: DEK_AAD },
      kekFor(keyring, fromVersion),
      fromBase64(sealed.wrappedDek)
    )
  );
  const ivDek = randomBytes(IV_BYTES);
  const wrappedDek = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: GCM, iv: ivDek, additionalData: DEK_AAD },
      kekFor(keyring, keyring.active),
      dekRaw
    )
  );
  return { wrappedDek: toBase64(wrappedDek), ivDek: toBase64(ivDek), kekVersion: keyring.active };
}
