import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const WORKER = "http://localhost:8787";
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

async function createQr(page: Page, targetUrl: string, label: string) {
  await page.goto("");
  await page.getByLabel(/Adresse de destination/).fill(targetUrl);
  await page.getByLabel(/Nom/).fill(label);
  // The Turnstile test sitekey auto-passes; the button enables once a token exists.
  const submit = page.getByRole("button", { name: "Créer le QR code" });
  await expect(submit).toBeEnabled({ timeout: 30_000 });
  await submit.click();
  await expect(page.getByRole("status")).toHaveText("QR code créé !", { timeout: 15_000 });

  const shortUrl = await page
    .locator("code", { hasText: `${WORKER}/r/` })
    .first()
    .innerText();
  const statsUrl = await page.locator("code", { hasText: "#/stats/" }).first().innerText();
  return { shortUrl, statsUrl };
}

test("full lifecycle: create → scan → stats → edit → disable → delete", async ({
  page,
  request,
}) => {
  const { shortUrl, statsUrl } = await createQr(
    page,
    "https://example.com/campagne",
    "Affiche E2E",
  );

  // The QR preview rendered from the short URL.
  await expect(page.getByAltText(`QR code vers ${shortUrl}`)).toBeVisible();

  // --- Scan simulation (phone UA, no redirect following) -------------------
  const scan = await request.get(shortUrl, {
    maxRedirects: 0,
    headers: { "User-Agent": IPHONE_UA, "Accept-Language": "fr-FR,fr;q=0.9" },
  });
  expect(scan.status()).toBe(302);
  expect(scan.headers().location).toBe("https://example.com/campagne");
  expect(scan.headers()["cache-control"]).toBe("no-store");

  // A bot preview also redirects but must not count in the default stats.
  const botScan = await request.get(shortUrl, {
    maxRedirects: 0,
    headers: { "User-Agent": "WhatsApp/2.23.20.0" },
  });
  expect(botScan.status()).toBe(302);

  // --- Stats dashboard (private link, key in the fragment) -----------------
  await page.goto(statsUrl);
  await expect(page.getByRole("heading", { name: /Statistiques — Affiche E2E/ })).toBeVisible();
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
  // Device breakdown recognized the phone.
  await expect(page.getByRole("rowheader", { name: "Mobile", exact: true })).toBeVisible();

  // Bot toggle includes the previewer scan.
  await page.getByRole("checkbox", { name: /Inclure les robots/ }).check();
  await expect(
    page.locator(".totals-grid .card").filter({ hasText: "Scans" }).locator(".value"),
  ).toHaveText("2", { timeout: 15_000 });

  // --- Change the destination without reprinting the QR code ---------------
  const target = page.getByLabel("Adresse de destination");
  await target.fill("https://example.org/nouvelle-destination");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Destination mise à jour.")).toBeVisible();

  const redirected = await request.get(shortUrl, {
    maxRedirects: 0,
    headers: { "User-Agent": IPHONE_UA },
  });
  expect(redirected.headers().location).toBe("https://example.org/nouvelle-destination");

  // --- Disable / re-enable --------------------------------------------------
  await page.getByRole("button", { name: "Désactiver le lien" }).click();
  await expect(page.getByText("Désactivé")).toBeVisible();
  const disabled = await request.get(shortUrl, { maxRedirects: 0 });
  expect(disabled.status()).toBe(410);
  expect(await disabled.text()).toContain("désactivé");

  await page.getByRole("button", { name: "Réactiver le lien" }).click();
  await expect(page.getByRole("button", { name: "Désactiver le lien" })).toBeVisible();

  // --- The code is in the local list ----------------------------------------
  await page.getByRole("link", { name: "Mes QR codes" }).click();
  await expect(page.getByRole("cell", { name: "Affiche E2E" })).toBeVisible();
  await page.locator("#main").getByRole("link", { name: "Statistiques" }).click();
  await expect(page.getByRole("heading", { name: /Statistiques — Affiche E2E/ })).toBeVisible();

  // --- Permanent delete ------------------------------------------------------
  page.on("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page).toHaveURL(/#\/codes$/);
  await expect(page.getByText(/Aucun QR code enregistré/)).toBeVisible();

  const gone = await request.get(shortUrl, { maxRedirects: 0 });
  expect(gone.status()).toBe(404);
  expect(await gone.text()).toContain("n'existe pas");
});

test("manual stats entry rejects a wrong key with a French error", async ({ page }) => {
  const { shortUrl } = await createQr(page, "https://example.com/autre", "Clé test");
  const slug = shortUrl.split("/r/")[1] ?? "";

  await page.goto("#/stats");
  await page.getByLabel(/Code du lien/).fill(slug);
  await page.getByLabel(/Clé secrète/).fill("A".repeat(43));
  await page.getByRole("button", { name: "Voir les statistiques" }).click();
  await expect(page.getByRole("alert")).toHaveText("Clé secrète invalide.", { timeout: 15_000 });
});
