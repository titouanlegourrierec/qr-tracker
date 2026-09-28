import { isbot } from "isbot";

/**
 * Messaging-app link previewers and crawlers that must be flagged even if the
 * general-purpose isbot list ever misses them (the brief names each of these).
 */
const PREVIEWER_PATTERN =
  /whatsapp|telegrambot|discordbot|slackbot|slack-imgproxy|twitterbot|facebookexternalhit|facebot|linkedinbot|skypeuripreview|snap url preview|pinterestbot|redditbot|vkshare|viber|line\/|micromessenger|applebot|googlebot|bingbot|duckduckbot|yandexbot|baiduspider/i;

/** True when the request comes from a known bot, crawler or link previewer. */
export function isBotUserAgent(userAgent: string | null): boolean {
  if (userAgent === null || userAgent.trim() === "") return true;
  return PREVIEWER_PATTERN.test(userAgent) || isbot(userAgent);
}
