import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";

import { App } from "../src/App.js";

import { KEY, SLUG } from "./msw.js";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App shell", () => {
  it("renders the create page and navigation landmarks", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { level: 1, name: "Créer un QR code" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders the privacy page in French", () => {
    renderAt("/confidentialite");
    expect(screen.getByRole("heading", { level: 1, name: "Confidentialité" })).toBeInTheDocument();
    expect(screen.getByText(/Aucune adresse IP n'est enregistrée/)).toBeInTheDocument();
  });

  it("renders a 404 page for unknown routes", () => {
    renderAt("/nimporte-quoi");
    expect(screen.getByRole("heading", { name: "Page introuvable" })).toBeInTheDocument();
  });

  it("navigates from the manual stats entry form to the dashboard route", async () => {
    const user = userEvent.setup();
    renderAt("/stats");
    await user.type(screen.getByLabelText(/Code du lien/), SLUG);
    await user.type(screen.getByLabelText(/Clé secrète/), KEY);
    await user.click(screen.getByRole("button", { name: "Voir les statistiques" }));
    expect(screen.getByRole("heading", { level: 1, name: "Statistiques" })).toBeInTheDocument();
  });

  it("shows a validation error for malformed slug/key", async () => {
    const user = userEvent.setup();
    renderAt("/stats");
    await user.type(screen.getByLabelText(/Code du lien/), "bad");
    await user.type(screen.getByLabelText(/Clé secrète/), "short");
    await user.click(screen.getByRole("button", { name: "Voir les statistiques" }));
    expect(screen.getByRole("alert")).toHaveTextContent("format invalide");
  });
});
