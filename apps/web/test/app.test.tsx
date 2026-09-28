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
    expect(screen.getByRole("heading", { level: 1, name: "Create a QR code" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("renders the privacy page", () => {
    renderAt("/privacy");
    expect(screen.getByRole("heading", { level: 1, name: "Privacy" })).toBeInTheDocument();
    expect(screen.getByText(/No IP address is ever stored/)).toBeInTheDocument();
  });

  it("renders a 404 page for unknown routes", () => {
    renderAt("/no-such-page");
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("navigates from the manual stats entry form to the dashboard route", async () => {
    const user = userEvent.setup();
    renderAt("/stats");
    await user.type(screen.getByLabelText(/Link code/), SLUG);
    await user.type(screen.getByLabelText(/Secret key/), KEY);
    await user.click(screen.getByRole("button", { name: "Show statistics" }));
    expect(screen.getByRole("heading", { level: 1, name: "Statistics" })).toBeInTheDocument();
  });

  it("shows a validation error for malformed slug/key", async () => {
    const user = userEvent.setup();
    renderAt("/stats");
    await user.type(screen.getByLabelText(/Link code/), "bad");
    await user.type(screen.getByLabelText(/Secret key/), "short");
    await user.click(screen.getByRole("button", { name: "Show statistics" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Badly formatted");
  });
});
