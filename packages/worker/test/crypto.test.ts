import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { seal, open, loadKek, generateKekBase64, type SealedSecret } from "../src/crypto";

const KEK_B64 = env.MASTER_KEK;

describe("envelope crypto", () => {
  it("round-trips a value", async () => {
    const kek = await loadKek(KEK_B64);
    const sealed = await seal("s3cr3t-value", "API_KEY", kek);
    expect(await open(sealed, "API_KEY", kek)).toBe("s3cr3t-value");
  });

  it("round-trips arbitrary strings and names (property)", async () => {
    const kek = await loadKek(KEK_B64);
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string({ minLength: 1 }), async (value, name) => {
        const sealed = await seal(value, name, kek);
        return (await open(sealed, name, kek)) === value;
      }),
      { numRuns: 100 }
    );
  });

  it("round-trips unicode and long values", async () => {
    const kek = await loadKek(KEK_B64);
    const value = "🔐 café — " + "x".repeat(5000);
    const sealed = await seal(value, "UNICODE", kek);
    expect(await open(sealed, "UNICODE", kek)).toBe(value);
  });

  it("never stores plaintext in the sealed fields", async () => {
    const kek = await loadKek(KEK_B64);
    const sealed = await seal("PLAINTEXT_MARKER", "X", kek);
    const blob = JSON.stringify(sealed);
    expect(blob).not.toContain("PLAINTEXT_MARKER");
  });

  it("produces distinct ciphertext for identical inputs (fresh DEK + IV)", async () => {
    const kek = await loadKek(KEK_B64);
    const a = await seal("same", "K", kek);
    const b = await seal("same", "K", kek);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.wrappedDek).not.toBe(b.wrappedDek);
  });

  it("fails to decrypt when the secret name (AAD) differs", async () => {
    const kek = await loadKek(KEK_B64);
    const sealed = await seal("v", "REAL_NAME", kek);
    await expect(open(sealed, "WRONG_NAME", kek)).rejects.toThrow();
  });

  it("fails to decrypt with a different KEK", async () => {
    const kek = await loadKek(KEK_B64);
    const otherKek = await loadKek(generateKekBase64());
    const sealed = await seal("v", "K", kek);
    await expect(open(sealed, "K", otherKek)).rejects.toThrow();
  });

  it("fails to decrypt tampered ciphertext (GCM auth tag)", async () => {
    const kek = await loadKek(KEK_B64);
    const sealed = await seal("v", "K", kek);
    const bytes = atob(sealed.ciphertext);
    const arr = Uint8Array.from(bytes, (c) => c.charCodeAt(0));
    arr[0] = (arr[0] ?? 0) ^ 0xff;
    let bin = "";
    for (const b of arr) bin += String.fromCharCode(b);
    const tampered: SealedSecret = { ...sealed, ciphertext: btoa(bin) };
    await expect(open(tampered, "K", kek)).rejects.toThrow();
  });

  it("rejects a KEK of the wrong length", async () => {
    await expect(loadKek(btoa("tooshort"))).rejects.toThrow();
  });
});
