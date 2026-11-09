import type { ErrorCode } from "@qr-tracker/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** HTTP status used for each error code. */
const STATUS_BY_CODE: Record<ErrorCode, ContentfulStatusCode> = {
  VALIDATION_ERROR: 400,
  TARGET_URL_INVALID: 400,
  TURNSTILE_FAILED: 403,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL: 500,
};

/** Typed error thrown by services and converted to the canonical JSON body by app.onError. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: ContentfulStatusCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}
