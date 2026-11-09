import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { AppBindings } from "../app.js";
import { ApiError } from "../lib/api-error.js";
import { MAX_REQUEST_BODY_BYTES } from "../lib/body-limit.js";

/**
 * Refuses request bodies over MAX_REQUEST_BODY_BYTES with 413 PAYLOAD_TOO_LARGE, so neither
 * JSON.parse nor Zod ever sees an oversized payload. A declared Content-Length is compared
 * without reading the body; a body sent without one (chunked) is read up to the cap at most.
 */
export function requestBodyLimit(): MiddlewareHandler<AppBindings> {
  const limit = bodyLimit({
    maxSize: MAX_REQUEST_BODY_BYTES,
    // Hono's default throws a text/plain HTTPException, which app.onError would turn into
    // a 500; an ApiError gets the canonical JSON error body.
    onError: () => {
      throw new ApiError(
        "PAYLOAD_TOO_LARGE",
        `Request body must not exceed ${MAX_REQUEST_BODY_BYTES} bytes`,
      );
    },
  });
  return (c, next) => limit(c, next);
}
