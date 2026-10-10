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
