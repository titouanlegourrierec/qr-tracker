import {
  createLinkResponseSchema,
  errorResponseSchema,
  linkSchema,
  statsResponseSchema,
} from "@qr-tracker/shared";
import type {
  CreateLinkRequest,
  CreateLinkResponse,
  ErrorCode,
  Link,
  StatsResponse,
  UpdateLinkRequest,
} from "@qr-tracker/shared";
import type { z } from "zod";

import { API_URL } from "../config.js";

export type ApiErrorCode = ErrorCode | "NETWORK";

/** Error thrown by every API helper; `code` maps to a user-facing message in en.errors. */
export class ApiRequestError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiRequestError";
    this.code = code;
  }
}

export interface StatsParams {
  from?: string;
  to?: string;
  tz?: string;
  includeBots?: boolean;
}

function statsSearch(params: StatsParams): string {
  const search = new URLSearchParams();
  if (params.from !== undefined) search.set("from", params.from);
  if (params.to !== undefined) search.set("to", params.to);
  if (params.tz !== undefined) search.set("tz", params.tz);
  if (params.includeBots === true) search.set("includeBots", "true");
  const qs = search.toString();
  return qs === "" ? "" : `?${qs}`;
}

/** The secret key travels in the Authorization header only — never in a URL. */
function authHeader(secretKey: string): Record<string, string> {
  return { Authorization: `Bearer ${secretKey}` };
}

async function doFetch(path: string, init?: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, init);
  } catch {
    throw new ApiRequestError("NETWORK", "Network failure");
  }
  if (!res.ok) {
    let code: ApiErrorCode = "INTERNAL";
    let message = `HTTP ${res.status}`;
    try {
      const parsed = errorResponseSchema.safeParse(await res.json());
      if (parsed.success) {
        code = parsed.data.error.code;
        message = parsed.data.error.message;
      }
    } catch {
      // non-JSON error body — keep the defaults
    }
    throw new ApiRequestError(code, message);
  }
  return res;
}

async function requestJson<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await doFetch(path, init);
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new ApiRequestError("INTERNAL", "Unexpected response shape");
  return parsed.data;
}

export const api = {
  createLink(input: CreateLinkRequest): Promise<CreateLinkResponse> {
    return requestJson("/api/links", createLinkResponseSchema, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  },

  getLink(slug: string, secretKey: string): Promise<Link> {
    return requestJson(`/api/links/${slug}`, linkSchema, { headers: authHeader(secretKey) });
  },

  getStats(slug: string, secretKey: string, params: StatsParams = {}): Promise<StatsResponse> {
    return requestJson(`/api/links/${slug}/stats${statsSearch(params)}`, statsResponseSchema, {
      headers: authHeader(secretKey),
    });
  },

  updateLink(slug: string, secretKey: string, patch: UpdateLinkRequest): Promise<Link> {
    return requestJson(`/api/links/${slug}`, linkSchema, {
      method: "PATCH",
      headers: { ...authHeader(secretKey), "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  },

  async deleteLink(slug: string, secretKey: string): Promise<void> {
    await doFetch(`/api/links/${slug}`, { method: "DELETE", headers: authHeader(secretKey) });
  },

  /** Downloads the CSV via fetch so the key stays in the header, returns a Blob. */
  async exportCsv(slug: string, secretKey: string, params: StatsParams = {}): Promise<Blob> {
    const res = await doFetch(`/api/links/${slug}/export${statsSearch(params)}`, {
      headers: authHeader(secretKey),
    });
    return res.blob();
  },
};
