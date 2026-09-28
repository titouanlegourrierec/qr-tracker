import { sha256Hex } from "./crypto.js";

/**
 * Daily-salted visitor hash: SHA-256(salt | slug | ip | userAgent).
 * The salt rotates every day and old salts are deleted, so hashes cannot be
 * reversed or linked across days — unique counts are per-day approximations.
 */
export async function computeVisitorHash(
  salt: string,
  slug: string,
  ip: string,
  userAgent: string,
): Promise<string> {
  return sha256Hex(`${salt}|${slug}|${ip}|${userAgent}`);
}
