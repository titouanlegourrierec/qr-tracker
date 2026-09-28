import { toDataURL, toString as renderToString } from "qrcode";

const OPTIONS = { errorCorrectionLevel: "M", margin: 2 } as const;

/** SVG markup for the QR code (vector, print-ready). */
export function qrSvg(text: string): Promise<string> {
  return renderToString(text, { ...OPTIONS, type: "svg" });
}

/** High-resolution PNG data URL (default 1024px — print-ready). */
export function qrPngDataUrl(text: string, width = 1024): Promise<string> {
  return toDataURL(text, { ...OPTIONS, width });
}
