import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CopyButton } from "../src/components/CopyButton.js";
import { qrSvg } from "../src/lib/qr.js";

describe("CopyButton", () => {
  it("copies the value and confirms", async () => {
    const user = userEvent.setup();
    render(<CopyButton value="https://example.com/r/abc" />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Copied!")).toBeInTheDocument();
    expect(await window.navigator.clipboard.readText()).toBe("https://example.com/r/abc");
  });

  it("says so when the browser refuses to copy", async () => {
    const user = userEvent.setup();
    render(<CopyButton value="x" label="Copy key" />);
    vi.spyOn(window.navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Copy key" }));
    expect(await screen.findByText("Copy failed")).toBeInTheDocument();
  });

  it("accepts a custom label", () => {
    render(<CopyButton value="x" label="Copy key" />);
    expect(screen.getByRole("button", { name: "Copy key" })).toBeInTheDocument();
  });
});

describe("qrSvg", () => {
  it("renders vector QR markup (pure JS, no canvas needed)", async () => {
    const svg = await qrSvg("https://example.com/r/abc1234");
    expect(svg).toContain("<svg");
    expect(svg).toContain("path");
  });
});
