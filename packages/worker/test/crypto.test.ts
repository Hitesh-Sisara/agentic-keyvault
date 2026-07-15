import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  sealValue,
  openValue,
  rewrapDek,
  loadKeyring,
  generateKekBase64,
  type SealedSecret,
  type Keyring
} from "../src/crypto";

async function keyring(): Promise<Keyring> {
  return loadKeyring({ MASTER_KEK: env.MASTER_KEK, KEK_VERSION: "1" });
}

describe("envelope crypto", () => {
  it("round-trips a value", async () => {
    const kr = await keyring();
    const { sealed, kekVersion } = await sealValue("s3cr3t-value", "API_KEY", kr);
    expect(kekVersion).toBe(1);
    expect(await openValue(sealed, "API_KEY", kr, kekVersion)).toBe("s3cr3t-value");
  });

  it("round-trips arbitrary strings and names (property)", async () => {
    const kr = await keyring();
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string({ minLength: 1 }), async (value, name) => {
        const { sealed, kekVersion } = await sealValue(value, name, kr);
        return (await openValue(sealed, name, kr, kekVersion)) === value;
      }),
      { numRuns: 100 }
    );
  });

  it("round-trips unicode and long values", async () => {
    const kr = await keyring();
    const value = "🔐 café — " + "x".repeat(5000);
    const { sealed, kekVersion } = await sealValue(value, "UNICODE", kr);
    expect(await openValue(sealed, "UNICODE", kr, kekVersion)).toBe(value);
  });

  it("never stores plaintext in the sealed fields", async () => {
    const kr = await keyring();
    const { sealed } = await sealValue("PLAINTEXT_MARKER", "X", kr);
    expect(JSON.stringify(sealed)).not.toContain("PLAINTEXT_MARKER");
  });

  it("produces distinct ciphertext for identical inputs", async () => {
    const kr = await keyring();
    const a = await sealValue("same", "K", kr);
    const b = await sealValue("same", "K", kr);
    expect(a.sealed.ciphertext).not.toBe(b.sealed.ciphertext);
    expect(a.sealed.wrappedDek).not.toBe(b.sealed.wrappedDek);
  });

  it("fails to decrypt when the secret name (AAD) differs", async () => {
    const kr = await keyring();
    const { sealed, kekVersion } = await sealValue("v", "REAL_NAME", kr);
    await expect(openValue(sealed, "WRONG_NAME", kr, kekVersion)).rejects.toThrow();
  });

  it("fails to decrypt with a different KEK", async () => {
    const kr = await keyring();
    const other = await loadKeyring({ MASTER_KEK: generateKekBase64(), KEK_VERSION: "1" });
    const { sealed, kekVersion } = await sealValue("v", "K", kr);
    await expect(openValue(sealed, "K", other, kekVersion)).rejects.toThrow();
  });

  it("fails to decrypt tampered ciphertext (GCM auth tag)", async () => {
    const kr = await keyring();
    const { sealed, kekVersion } = await sealValue("v", "K", kr);
    const arr = Uint8Array.from(atob(sealed.ciphertext), (c) => c.charCodeAt(0));
    arr[0] = (arr[0] ?? 0) ^ 0xff;
    let bin = "";
    for (const b of arr) bin += String.fromCharCode(b);
    const tampered: SealedSecret = { ...sealed, ciphertext: btoa(bin) };
    await expect(openValue(tampered, "K", kr, kekVersion)).rejects.toThrow();
  });

  it("rejects a KEK of the wrong length", async () => {
    await expect(loadKeyring({ MASTER_KEK: btoa("tooshort") })).rejects.toThrow();
  });
});

describe("KEK rotation (re-wrap)", () => {
  it("re-wraps a DEK to a new active KEK and still decrypts", async () => {
    const oldKekB64 = env.MASTER_KEK;
    const newKekB64 = generateKekBase64();

    // v1 keyring seals a value under KEK v1.
    const v1 = await loadKeyring({ MASTER_KEK: oldKekB64, KEK_VERSION: "1" });
    const { sealed, kekVersion } = await sealValue("rotate-me", "TOKEN", v1);
    expect(kekVersion).toBe(1);

    // Operator sets a new active key (v2) and keeps the old one as MASTER_KEK_V1.
    const v2 = await loadKeyring({
      MASTER_KEK: newKekB64,
      KEK_VERSION: "2",
      MASTER_KEK_V1: oldKekB64
    });

    // Old value can still be read (KEK v1 available), and can be re-wrapped.
    expect(await openValue(sealed, "TOKEN", v2, 1)).toBe("rotate-me");
    const rewrapped = await rewrapDek(sealed, v2, 1);
    expect(rewrapped.kekVersion).toBe(2);

    const migrated: SealedSecret = {
      ciphertext: sealed.ciphertext,
      ivValue: sealed.ivValue,
      wrappedDek: rewrapped.wrappedDek,
      ivDek: rewrapped.ivDek
    };

    // After re-wrap, the value decrypts under the new active key alone.
    const v2Only = await loadKeyring({ MASTER_KEK: newKekB64, KEK_VERSION: "2" });
    expect(await openValue(migrated, "TOKEN", v2Only, rewrapped.kekVersion)).toBe("rotate-me");
  });
});
