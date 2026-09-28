import { RATE_LIMITS } from "@qr-tracker/shared";
import type { RateLimitScope } from "@qr-tracker/shared";
import type { Context, MiddlewareHandler } from "hono";

import type { AppBindings } from "../app.js";
import { ApiError } from "../lib/api-error.js";
import { sha256Hex } from "../lib/crypto.js";
import { logError } from "../lib/log.js";
import { isOverLimit, rateLimitKey, windowStart } from "../lib/rate-limit.js";
import { incrementRateLimit } from "../repositories/rate-limits.js";
import { getOrCreateDailySalt } from "../repositories/salts.js";

export interface RateLimitOptions {
  /**
   * Failure mode when the limiter itself errors (e.g. D1 unavailable):
   * reads fail open (request proceeds), writes fail closed (500).
   */
  failOpen: boolean;
  /** Extra key component, e.g. the slug on per-link endpoints. */
  keySuffix?: (c: Context<AppBindings>) => string;
}

/**
 * D1-backed fixed-window rate limiter. Identifiers are hashed with the daily
 * salt so no raw IP is ever stored.
 */
export function rateLimit(
  scope: RateLimitScope,
  options: RateLimitOptions,
): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const config = RATE_LIMITS[scope];
    try {
      const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
      const day = new Date().toISOString().slice(0, 10);
      const salt = await getOrCreateDailySalt(c.env.DB, day);
      const identifierHash = await sha256Hex(`${salt}|${ip}`);
      const key = rateLimitKey(scope, identifierHash, options.keySuffix?.(c));
      const count = await incrementRateLimit(
        c.env.DB,
        key,
        windowStart(Date.now(), config.windowSeconds),
      );
      if (isOverLimit(count, config.limit)) {
        throw new ApiError("RATE_LIMITED", "Too many requests, retry later");
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logError("rate_limiter_error", error, { scope, failOpen: options.failOpen });
      if (!options.failOpen) throw new ApiError("INTERNAL", "Rate limiter unavailable");
    }
    await next();
  };
}
