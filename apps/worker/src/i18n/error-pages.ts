/** Friendly HTML pages served on /r/:slug errors. */

function page(title: string, heading: string, message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; display: grid; place-items: center;
         min-height: 100vh; margin: 0; background: #f6f7f9; color: #1c1c1e; }
  @media (prefers-color-scheme: dark) { body { background: #17181a; color: #ececee; } }
  main { text-align: center; padding: 2rem; max-width: 26rem; }
  h1 { font-size: 1.4rem; }
  p { line-height: 1.5; }
</style>
</head>
<body>
<main>
  <h1>${heading}</h1>
  <p>${message}</p>
</main>
</body>
</html>`;
}

export const NOT_FOUND_PAGE = page(
  "Link not found",
  "This link does not exist",
  "This QR code does not match any known link. It may have been deleted by its owner.",
);

export const DISABLED_PAGE = page(
  "Link disabled",
  "This link is disabled",
  "The owner of this QR code has temporarily disabled the redirect. Please try again later.",
);
