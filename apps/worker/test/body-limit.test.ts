import { env } from "cloudflare:workers";

import {
  errorResponseSchema,
  MAX_LABEL_LENGTH,
  MAX_TARGET_URL_LENGTH,
  MAX_TURNSTILE_TOKEN_LENGTH,
} from "@qr-tracker/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "../src/app.js";
import { MAX_REQUEST_BODY_BYTES } from "../src/lib/body-limit.js";

const app = createApp();
const BASE = "https://qr-tracker.example.workers.dev";
const WEB_ORIGIN = "https://titouanlegourrierec.github.io";
const CHUNK_BYTES = 1024;
const OVER_CAP = MAX_REQUEST_BODY_BYTES + 1;

const utf8Length = (text: string): number => new TextEncoder().encode(text).byteLength;

/** A valid creation request padded with trailing whitespace (still valid JSON) to `size` bytes. */
function createBodyOfSize(size: number): string {
  const json = JSON.stringify({ targetUrl: "https://example.com/padded", turnstileToken: "tok" });
  return json.padEnd(size, " ");
}

/** Streams `text` in 1 KiB chunks, only when read, and counts the chunks handed out. */
function chunkedStream(text: string): { stream: ReadableStream<Uint8Array>; pulls: () => number } {
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  let pulls = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (offset >= bytes.byteLength) {
          controller.close();
          return;
        }
        pulls++;
        controller.enqueue(bytes.slice(offset, offset + CHUNK_BYTES));
        offset += CHUNK_BYTES;
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulls: () => pulls };
}

interface SendOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Content-Length to declare; omitted, the body has none (like a chunked upload). */
  contentLength?: number;
}

async function send(path: string, body: BodyInit, options: SendOptions = {}): Promise<Response> {
  return await app.request(
    `${BASE}${path}`,
    {
      method: options.method ?? "POST",
      headers: {
        "Content-Type": "application/json",
        "CF-Connecting-IP": crypto.randomUUID(),
        ...(options.contentLength === undefined
          ? {}
          : { "Content-Length": String(options.contentLength) }),
        ...options.headers,
      },
      body,
    },
    env,
  );
}

/** Sends `text` with its Content-Length, or streamed without one. */
function sendText(
  path: string,
  text: string,
  declared: boolean,
  options: SendOptions = {},
): Promise<Response> {
  return declared
    ? send(path, text, { ...options, contentLength: utf8Length(text) })
    : send(path, chunkedStream(text).stream, options);
}

async function expectPayloadTooLarge(res: Response): Promise<void> {
  expect(res.status).toBe(413);
  const { error } = errorResponseSchema.parse(await res.json());
  expect(error.code).toBe("PAYLOAD_TOO_LARGE");
  expect(error.message).toBe(`Request body must not exceed ${MAX_REQUEST_BODY_BYTES} bytes`);
}

async function countRows(table: "links" | "rate_limits"): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? 0;
}

const BODY_DELIVERIES = [
  ["with a Content-Length", true],
  ["streamed without a Content-Length", false],
] as const;

beforeEach(() => {
  // Turnstile siteverify always succeeds.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(Response.json({ success: true }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("request body limit", () => {
  it.each(BODY_DELIVERIES)(
    "%s: accepts a body of exactly the cap, refuses one byte more",
    async (_, declared) => {
      const atCap = await sendText(
        "/api/links",
        createBodyOfSize(MAX_REQUEST_BODY_BYTES),
        declared,
      );
      expect(atCap.status).toBe(201);
      await expectPayloadTooLarge(
        await sendText("/api/links", createBodyOfSize(OVER_CAP), declared),
      );
    },
  );

  it("refuses an oversized Content-Length without reading the body or rate limiting", async () => {
    const [links, windows] = [await countRows("links"), await countRows("rate_limits")];
    const { stream, pulls } = chunkedStream(createBodyOfSize(OVER_CAP));

    await expectPayloadTooLarge(await send("/api/links", stream, { contentLength: OVER_CAP }));
    expect(pulls()).toBe(0);
    expect(await countRows("links")).toBe(links);
    expect(await countRows("rate_limits")).toBe(windows);
  });

  it("stops reading a streamed body once it passes the cap", async () => {
    const { stream, pulls } = chunkedStream(createBodyOfSize(1024 * CHUNK_BYTES)); // 1 MiB

    await expectPayloadTooLarge(await send("/api/links", stream));
    // The chunks up to the cap, plus the one that crosses it.
    expect(pulls()).toBe(MAX_REQUEST_BODY_BYTES / CHUNK_BYTES + 1);
  });

  describe.each(BODY_DELIVERIES)("%s", (_, declared) => {
    it.each([
      ["POST", "/api/links/summaries"],
      ["PATCH", "/api/links/AAAAAAA"],
      ["POST", "/api/reports"],
      ["POST", "/api/admin/links/AAAAAAA/status"],
    ])("guards %s %s too", async (method, path) => {
      await expectPayloadTooLarge(
        await sendText(path, createBodyOfSize(OVER_CAP), declared, {
          method,
          headers: { Authorization: "Bearer x" },
        }),
      );
    });
  });

  it("keeps the CORS headers the web app needs to read the error", async () => {
    const res = await sendText("/api/links", createBodyOfSize(OVER_CAP), true, {
      headers: { Origin: WEB_ORIGIN },
    });
    await expectPayloadTooLarge(res);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(WEB_ORIGIN);
    expect(res.headers.get("Vary")).toBe("Origin");
  });

  it("lets the largest realistic creation request through", async () => {
    const body = JSON.stringify({
      targetUrl: "https://example.com/".padEnd(MAX_TARGET_URL_LENGTH, "a"),
      label: "€".repeat(MAX_LABEL_LENGTH),
      turnstileToken: "€".repeat(MAX_TURNSTILE_TOKEN_LENGTH),
    });
    expect((await sendText("/api/links", body, true)).status).toBe(201);
  });
});
