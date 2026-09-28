function escapeCell(value: unknown): string {
  let text: string;
  if (typeof value === "string") text = value;
  else if (typeof value === "number" || typeof value === "boolean") text = String(value);
  else return ""; // null/undefined — D1 cells are only ever string | number | null
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Serializes rows to RFC-4180-style CSV with a header line. */
export function toCsv(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCell(row[col])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
