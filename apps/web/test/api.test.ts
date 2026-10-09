import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { api, ApiRequestError } from "../src/lib/api.js";

import { KEY, makeStats, server, SLUG } from "./msw.js";

const API = "http://localhost:8787";

describe("api client", () => {
  it("creates a link and validates the response", async () => {
    server.use(
      http.post(`${API}/api/links`, async ({ request }) => {
        const body = (await request.json()) as Record<string, string>;
        expect(body.targetUrl).toBe("https://example.com");
        expect(body.turnstileToken).toBe("tok");
        return HttpResponse.json(
          { slug: SLUG, shortUrl: `${API}/r/${SLUG}`, secretKey: KEY },
          { status: 201 },
        );
      }),
    );
    const created = await api.createLink({
      targetUrl: "https://example.com",
      turnstileToken: "tok",
    });
    expect(created.slug).toBe(SLUG);
  });

  it("summarizes long lists in chunks the worker accepts, keeping their order", async () => {
    const sizes: number[] = [];
    server.use(
      http.post(`${API}/api/links/summaries`, async ({ request }) => {
        const body = (await request.json()) as { links: { slug: string }[] };
        sizes.push(body.links.length);
        return HttpResponse.json({
          summaries: body.links.map(({ slug }) => ({ ok: false, slug, error: "NOT_FOUND" })),
        });
      }),
    );
    const links = Array.from({ length: 120 }, (_, i) => ({
      slug: `abc${String(i).padStart(4, "0")}`,
      secretKey: KEY,
    }));
    const summaries = await api.summarizeLinks(links);
    expect(sizes.sort((a, b) => b - a)).toEqual([50, 50, 20]);
    expect(summaries.map((s) => s.slug)).toEqual(links.map((l) => l.slug));
  });

  it("sends the secret key as a Bearer header, never in the URL", async () => {
    let seenAuth: string | null = null;
    let seenUrl = "";
    server.use(
      http.get(`${API}/api/links/${SLUG}/stats`, ({ request }) => {
        seenAuth = request.headers.get("Authorization");
        seenUrl = request.url;
        return HttpResponse.json(makeStats());
      }),
    );
    await api.getStats(SLUG, KEY, { tz: "Europe/Paris" });
    expect(seenAuth).toBe(`Bearer ${KEY}`);
    expect(seenUrl).not.toContain(KEY);
  });

  it("maps API error bodies to typed errors", async () => {
    server.use(
      http.get(`${API}/api/links/${SLUG}`, () =>
        HttpResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Invalid secret key" } },
          { status: 401 },
        ),
      ),
    );
    const failure = api.getLink(SLUG, KEY);
    await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
    await expect(failure).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("maps network failures to the NETWORK code", async () => {
    server.use(http.get(`${API}/api/links/${SLUG}`, () => HttpResponse.error()));
    await expect(api.getLink(SLUG, KEY)).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("rejects unexpected response shapes", async () => {
    server.use(http.get(`${API}/api/links/${SLUG}`, () => HttpResponse.json({ nope: true })));
    await expect(api.getLink(SLUG, KEY)).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("deletes without parsing a body and downloads CSV blobs", async () => {
    server.use(
      http.delete(`${API}/api/links/${SLUG}`, () => new HttpResponse(null, { status: 204 })),
      http.get(
        `${API}/api/links/${SLUG}/export`,
        () => new HttpResponse("a,b\r\n1,2\r\n", { headers: { "Content-Type": "text/csv" } }),
      ),
    );
    await expect(api.deleteLink(SLUG, KEY)).resolves.toBeUndefined();
    const blob = await api.exportCsv(SLUG, KEY, { includeBots: true });
    expect(await blob.text()).toContain("a,b");
  });
});
