/**
 * Map services return the full postal hierarchy in two scripts
 * ("Riad Tétouan رياض تطوان, Tanger-Medina طنجة المدينة, Tanger, ..."). Keep the readable start.
 */
export function shortAddress(label: string): string {
  const parts: string[] = [];
  for (const raw of label.split(",")) {
    const part = raw
      .replace(/[؀-ۿݐ-ݿࢠ-ࣿ]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (part.length < 2 || /^\d+$/.test(part) || /^maroc$/i.test(part)) continue;
    if (parts.some((known) => known.toLowerCase() === part.toLowerCase())) continue;
    parts.push(part);
    if (parts.length === 3) break;
  }
  const text = parts.join(", ");
  return (text || label).slice(0, 90);
}
