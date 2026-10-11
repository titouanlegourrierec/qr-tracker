import { secretKeySchema, slugSchema } from "@qr-tracker/shared";

/**
 * Extracts a link code from what a person pastes: a full short link
 * ("https://…/r/Ab3xY9z", with or without a trailing slash or query) or the bare
 * 7-character code. Returns null when neither form matches.
 */
export function parseSlugInput(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = /\/r\/([0-9A-Za-z]+)\/?(?:[?#].*)?$/.exec(trimmed)?.[1];
  const candidate = fromUrl ?? trimmed;
  return slugSchema.safeParse(candidate).success ? candidate : null;
}

/**
 * Statistics link of this web app for a code and a key (secret or read-only). The key
 * lives only in the fragment, which browsers never send to any server.
 */
export function privateStatsUrl(slug: string, key: string): string {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#/stats/${slug}/${key}`;
}

/**
 * Extracts the code and key from a pasted private statistics link
 * ("https://…/qr-tracker/#/stats/Ab3xY9z/<43-character key>"). Returns null otherwise.
 */
export function parseStatsLink(input: string): { slug: string; secretKey: string } | null {
  const match = /#\/stats\/([^/]+)\/([^/?#]+)\/?$/.exec(input.trim());
  const slug = match?.[1];
  const secretKey = match?.[2];
  if (slug === undefined || secretKey === undefined) return null;
  if (!slugSchema.safeParse(slug).success || !secretKeySchema.safeParse(secretKey).success) {
    return null;
  }
  return { slug, secretKey };
}
