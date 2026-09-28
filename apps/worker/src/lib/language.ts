/**
 * Primary language tag of an Accept-Language header ("fr-FR,fr;q=0.9" → "fr").
 * Returns null when the header is missing, malformed or a wildcard.
 */
export function parsePrimaryLanguage(acceptLanguage: string | null): string | null {
  if (acceptLanguage === null) return null;
  const first = acceptLanguage.split(",")[0]?.split(";")[0]?.trim().toLowerCase();
  if (first === undefined || first === "" || first === "*") return null;
  const primary = first.split("-")[0] ?? "";
  return /^[a-z]{2,3}$/.test(primary) ? primary : null;
}
