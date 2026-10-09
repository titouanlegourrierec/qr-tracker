import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const WORKER = "http://localhost:8787";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function createQr(page: Page, targetUrl: string, label: string) {
  await page.goto("");
  await page.getByLabel(/Destination address/).fill(targetUrl);
  await page.getByLabel(/Name/).fill(label);
  // The Turnstile test sitekey auto-passes; the button enables once a token exists.
  const submit = page.getByRole("button", { name: "Create QR code" });
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await submit.click();
  await expect(page.getByRole("status")).toHaveText("QR code created!", { timeout: 15_000 });

  const shortUrl = await page
    .locator("code", { hasText: `${WORKER}/r/` })
    .first()
    .innerText();
  const statsUrl = await page.locator("code", { hasText: "#/stats/" }).first().innerText();
  // Acknowledging the one-time key also disarms the "leave this page?" warning.
  await page.getByRole("checkbox", { name: /saved my secret key/ }).check();
  return { shortUrl, statsUrl };
}

test("full lifecycle: create → scan → stats → edit → disable → delete", async ({
  page,
  request,
}) => {
  const { shortUrl, statsUrl } = await createQr(page, "https://example.com/campaign", "E2E poster");

  // The QR preview rendered from the short URL.
  await expect(page.getByAltText(`QR code for ${shortUrl}`)).toBeVisible();

  // --- Scan simulation (phone UA, no redirect following) -------------------
  const scan = await request.get(shortUrl, {
    maxRedirects: 0,
    headers: { "User-Agent": IPHONE_UA, "Accept-Language": "fr-FR,fr;q=0.9" },
  });
  expect(scan.status()).toBe(302);
  expect(scan.headers().location).toBe("https://example.com/campaign");
  expect(scan.headers()["cache-control"]).toBe("no-store");

  // A bot preview also redirects but must not count in the default stats.
  const botScan = await request.get(shortUrl, {
    maxRedirects: 0,
    headers: { "User-Agent": "WhatsApp/2.23.20.0" },
  });
  expect(botScan.status()).toBe(302);

  // --- Stats dashboard (private link, key in the fragment) -----------------
  await page.goto(statsUrl);
  await expect(page.getByRole("heading", { name: /Statistics — E2E poster/ })).toBeVisible();
  // 1 human scan (the WhatsApp preview is excluded by default). The scan is
  // recorded asynchronously (ctx.waitUntil), so reload until it appears.
  const scansValue = page
    .locator(".totals-grid .card")
    .filter({ hasText: "Scans" })
    .locator(".value");
  await expect(async () => {
    await page.reload();
    await expect(scansValue).toHaveText("1", { timeout: 3_000 });
  }).toPass({ timeout: 20_000 });
  // Charts actually render on a real canvas.
  await expect(page.locator("canvas").first()).toBeVisible();
  // The world map is drawn from the real topology, one shape per country.
  await expect(page.locator(".geo-map-svg")).toBeVisible();
  expect(await page.locator(".geo-map-svg path").count()).toBeGreaterThan(100);
  // Device breakdown recognized the phone.
  await expect(page.getByRole("rowheader", { name: "Mobile", exact: true })).toBeVisible();

  // Bot toggle includes the previewer scan.
  await page.getByRole("checkbox", { name: /Include bots/ }).check();
  await expect(
    page.locator(".totals-grid .card").filter({ hasText: "Scans" }).locator(".value"),
  ).toHaveText("2", { timeout: 15_000 });

  // --- Change the destination without reprinting the QR code ---------------
  const target = page.getByLabel("Destination address");
  await target.fill("https://example.org/new-destination");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Destination updated.")).toBeVisible();

  const redirected = await request.get(shortUrl, {
    maxRedirects: 0,
    headers: { "User-Agent": IPHONE_UA },
  });
  expect(redirected.headers().location).toBe("https://example.org/new-destination");

  // --- Disable / re-enable --------------------------------------------------
  await page.getByRole("button", { name: "Disable link" }).click();
  await expect(page.getByText("Disabled", { exact: true })).toBeVisible();
  const disabled = await request.get(shortUrl, { maxRedirects: 0 });
  expect(disabled.status()).toBe(410);
  expect(await disabled.text()).toContain("disabled");

  await page.getByRole("button", { name: "Re-enable link" }).click();
  await expect(page.getByRole("button", { name: "Disable link" })).toBeVisible();

  // --- The code is in the local list ----------------------------------------
  await page.getByRole("link", { name: "My QR codes" }).click();
  const row = page.getByRole("row", { name: /E2E poster/ });
  await expect(row).toBeVisible();
  // Two phone scans, before and after the change of destination; the WhatsApp preview
  // is left out, as on the dashboard.
  await expect(row.getByRole("cell", { name: "2", exact: true })).toBeVisible();
  await page.locator("#main").getByRole("link", { name: "Statistics" }).click();
  await expect(page.getByRole("heading", { name: /Statistics — E2E poster/ })).toBeVisible();

  // --- Permanent delete ------------------------------------------------------
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/#\/codes$/);
  await expect(page.getByRole("status")).toHaveText("QR code deleted.");
  await expect(page.getByText(/No QR codes saved/)).toBeVisible();

  const gone = await request.get(shortUrl, { maxRedirects: 0 });
  expect(gone.status()).toBe(404);
  expect(await gone.text()).toContain("does not exist");
});

test("manual stats entry: a wrong key is refused, the pasted private link opens", async ({
  page,
}) => {
  const { shortUrl, statsUrl } = await createQr(page, "https://example.com/other", "Test key");
  const slug = shortUrl.split("/r/")[1] ?? "";

  await page.goto("#/stats");
  await page.getByLabel(/Link code/).fill(slug);
  await page.getByLabel(/Secret key/).fill("A".repeat(43));
  await page.getByRole("button", { name: "Show statistics" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid secret key.", {
    timeout: 15_000,
  });

  await page.goto("#/stats");
  await page.getByLabel(/Link code/).fill(statsUrl);
  await page.getByRole("button", { name: "Show statistics" }).click();
  await expect(page.getByRole("heading", { name: /Statistics — Test key/ })).toBeVisible();
});

test("a read-only link shows the statistics but cannot manage the QR code", async ({
  page,
  request,
}) => {
  const { shortUrl, statsUrl } = await createQr(page, "https://example.com/shared", "Shared");
  const slug = shortUrl.split("/r/")[1] ?? "";

  await page.goto(statsUrl);
  await page.getByRole("button", { name: "Create a read-only link" }).click();
  await expect(page.getByText(/Read-only link created/)).toBeVisible({ timeout: 15_000 });
  const viewUrl = await page.locator("code", { hasText: `#/stats/${slug}/` }).innerText();
  expect(viewUrl).not.toBe(statsUrl);

  await page.goto(viewUrl);
  await expect(page.getByRole("heading", { name: /Statistics — Shared/ })).toBeVisible();
  await expect(page.getByText("Read-only view")).toBeVisible();
  await expect(page.getByRole("region", { name: "Manage this QR code" })).toHaveCount(0);

  // The worker refuses the read-only key for anything but reading.
  const viewKey = viewUrl.split("/").at(-1) ?? "";
  const patch = await request.patch(`${WORKER}/api/links/${slug}`, {
    headers: { Authorization: `Bearer ${viewKey}` },
    data: { status: "disabled" },
  });
  expect(patch.status()).toBe(401);
});

test("anyone can report a QR code from its short link", async ({ page }) => {
  const { shortUrl } = await createQr(page, "https://example.com/suspicious", "Reported");

  await page.getByRole("link", { name: "Report abuse" }).click();
  await page.getByLabel("Short link or code").fill(shortUrl);
  await page.getByRole("radio", { name: /Phishing or scam/ }).check();
  await page.getByLabel(/Details/).fill("Asks for a bank password");
  const send = page.getByRole("button", { name: "Send report" });
  await expect(send).toBeEnabled({ timeout: 30_000 });
  await send.click();
  await expect(page.getByRole("status")).toContainText("your report was sent", {
    timeout: 15_000,
  });
});
