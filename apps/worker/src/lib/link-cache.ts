import type { LinkStatus } from "@qr-tracker/shared";

/** The fields a redirect needs (never the secret hash). */
export interface RedirectLink {
  id: number;
  slug: string;
  target_url: string;
  status: LinkStatus;
}

interface Entry {
  link: RedirectLink;
  storedAtMs: number;
}

/**
 * Last known state of recently resolved links, kept in isolate memory. It is never
 * authoritative: redirects always ask D1 first and only fall back to this copy when D1
 * fails (outage or exhausted daily quota), so printed QR codes keep working meanwhile.
 * Bounded in size (oldest entry evicted first) and in age.
 */
export class LinkCache {
  readonly #entries = new Map<string, Entry>();
  readonly #maxEntries: number;
  readonly #maxAgeMs: number;

  constructor(maxEntries: number, maxAgeMs: number) {
    this.#maxEntries = maxEntries;
    this.#maxAgeMs = maxAgeMs;
  }

  get size(): number {
    return this.#entries.size;
  }

  remember(link: RedirectLink, nowMs = Date.now()): void {
    // Re-inserting moves the slug to the end of the Map's insertion order.
    this.#entries.delete(link.slug);
    this.#entries.set(link.slug, {
      link: { id: link.id, slug: link.slug, target_url: link.target_url, status: link.status },
      storedAtMs: nowMs,
    });
    if (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done !== true) this.#entries.delete(oldest.value);
    }
  }

  forget(slug: string): void {
    this.#entries.delete(slug);
  }

  recall(slug: string, nowMs = Date.now()): RedirectLink | null {
    const entry = this.#entries.get(slug);
    if (entry === undefined) return null;
    if (nowMs - entry.storedAtMs > this.#maxAgeMs) {
      this.#entries.delete(slug);
      return null;
    }
    return entry.link;
  }
}
