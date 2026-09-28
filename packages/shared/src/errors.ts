import { z } from "zod";

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "TARGET_URL_INVALID",
  "TURNSTILE_FAILED",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Builds the canonical JSON error body used by every API error. */
export function errorBody(code: ErrorCode, message: string): ErrorResponse {
  return { error: { code, message } };
}
