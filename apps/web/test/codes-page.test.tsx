import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { saveCode, loadCodes } from "../src/lib/storage.js";
import { CodesPage } from "../src/pages/CodesPage.js";

import { KEY } from "./msw.js";

function seed(slug: string, label: string | null = null): void {
  saveCode({ slug, label, secretKey: KEY, createdAt: "2026-09-20T10:00:00.000Z" });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CodesPage />
    </MemoryRouter>,
  );
}

describe("CodesPage", () => {
  it("shows an empty state", () => {
    renderPage();
    expect(screen.getByText(/Aucun QR code enregistré/)).toBeInTheDocument();
  });

  it("lists stored codes with a stats link carrying the key in the route", () => {
    seed("aaaaaaa", "Affiche B");
    renderPage();
    expect(screen.getByText("Affiche B")).toBeInTheDocument();
    // MemoryRouter renders plain hrefs; in production HashRouter prefixes "#".
    const link = screen.getByRole("link", { name: "Statistiques" });
    expect(link).toHaveAttribute("href", `/stats/aaaaaaa/${KEY}`);
  });

  it("removes a code after confirmation", async () => {
    seed("aaaaaaa");
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage();
    await user.click(screen.getByRole("button", { name: "Retirer de la liste" }));
    expect(loadCodes()).toHaveLength(0);
    expect(screen.getByText(/Aucun QR code enregistré/)).toBeInTheDocument();
  });

  it("imports a JSON backup", async () => {
    const user = userEvent.setup();
    renderPage();
    const payload = JSON.stringify({
      version: 1,
      items: [
        {
          slug: "bbbbbbb",
          label: "Importé",
          secretKey: KEY,
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    });
    const file = new File([payload], "backup.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("Importer (JSON)"), file);

    expect(await screen.findByText("1 QR code(s) importé(s).")).toBeInTheDocument();
    expect(screen.getByText("Importé")).toBeInTheDocument();
  });

  it("reports invalid import files", async () => {
    const user = userEvent.setup();
    renderPage();
    const file = new File(["{broken"], "bad.json", { type: "application/json" });
    await user.upload(screen.getByLabelText("Importer (JSON)"), file);
    expect(await screen.findByRole("alert")).toHaveTextContent("Fichier invalide");
  });
});
