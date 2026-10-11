/**
 * True when the app runs inside a frame. GitHub Pages cannot send `frame-ancestors`, so
 * the app refuses to render framed instead: an invisible frame laid over a decoy page could
 * otherwise trick an owner into clicking "Delete permanently" (clickjacking).
 */
export function isFramed(win: { readonly self: unknown; readonly top: unknown } = window): boolean {
  try {
    return win.self !== win.top;
  } catch {
    // Some sandboxes throw on access to the top window: that is a frame too.
    return true;
  }
}
