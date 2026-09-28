import { SECRET_KEY_BYTES, SLUG_ALPHABET, SLUG_LENGTH } from "@qr-tracker/shared";

/** Largest multiple of 62 below 256, for unbiased rejection sampling. */
const SLUG_REJECTION_BOUND = 248;

/** Random base62 slug (rejection sampling keeps the distribution uniform). */
export function generateSlug(): string {
  let slug = "";
  while (slug.length < SLUG_LENGTH) {
    const bytes = new Uint8Array(SLUG_LENGTH * 2);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < SLUG_REJECTION_BOUND && slug.length < SLUG_LENGTH) {
        slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length] ?? "";
      }
    }
  }
  return slug;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** 256-bit random value encoded as unpadded base64url (43 chars). */
export function generateSecretKey(): string {
  const bytes = new Uint8Array(SECRET_KEY_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** Random salt for daily visitor-hash rotation. */
export function generateSalt(): string {
  return generateSecretKey();
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Constant-time comparison of two hex digests (Workers' crypto.subtle.timingSafeEqual).
 * Length is not secret: digests compared here are always SHA-256 outputs.
 */
export function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  const a = hexToBytes(aHex);
  const b = hexToBytes(bHex);
  if (a === null || b === null) return false;
  if (a.byteLength !== b.byteLength) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}
