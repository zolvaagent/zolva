import "server-only";

/**
 * Rushr API keys of trench agents are stored encrypted (AES-GCM, 256-bit key from the
 * TRENCH_KEY_SECRET setting, base64). Format: "v1.<iv base64>.<ciphertext base64>".
 * A key is decrypted only in the runner, right before a Rushr call; it never reaches a browser.
 */

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0));

async function importKey(secret: string): Promise<CryptoKey> {
  const raw = fromBase64(secret);
  if (raw.length !== 32) throw new Error("TRENCH_KEY_SECRET must be 32 bytes, base64");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(secret), new TextEncoder().encode(plain)));
  return `v1.${toBase64(iv)}.${toBase64(sealed)}`;
}

export async function decryptSecret(sealed: string, secret: string): Promise<string> {
  const [version, iv, body] = sealed.split(".");
  if (version !== "v1" || !iv || !body) throw new Error("unknown sealed secret format");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await importKey(secret), fromBase64(body));
  return new TextDecoder().decode(plain);
}
