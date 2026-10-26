/** Pure helpers for trusted contacts and SOS messages (browser-safe, no network). */

const MOROCCO_NUMBER = /^(?:\+212|00212|0)([5-7]\d{8})$/;

/** Returns an international Moroccan number such as +212612345678, or null when it is not valid. */
export function normalizeMoroccanPhone(input: string): string | null {
  const compact = input.replace(/[\s.\-()]/g, "");
  const match = MOROCCO_NUMBER.exec(compact);
  return match ? `+212${match[1]}` : null;
}

export function osmLink(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new RangeError("Invalid position");
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=17/${lat.toFixed(5)}/${lng.toFixed(5)}`;
}

export function positionMessage(input: { firstName: string; position: { lat: number; lng: number } | null; alert: boolean }): string {
  const who = input.firstName.trim() || "Une étudiante";
  const where = input.position ? ` Ma position : ${osmLink(input.position.lat, input.position.lng)}` : " Ma position n’est pas disponible.";
  return input.alert
    ? `ALERTE Rafiq : ${who} a déclenché le bouton SOS pendant un covoiturage. Appelez cette personne tout de suite.${where}`
    : `Rafiq : ${who} est en covoiturage.${where}`;
}

export function smsHref(phone: string, body: string): string {
  return `sms:${phone}?body=${encodeURIComponent(body)}`;
}

export function whatsappHref(phone: string, body: string): string {
  return `https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(body)}`;
}

/** Morocco: police 19, gendarmerie royale 177, protection civile / ambulance 15. */
export const EMERGENCY_NUMBERS = [
  { label: "Police", number: "19" },
  { label: "Gendarmerie royale", number: "177" },
  { label: "Protection civile", number: "15" },
] as const;
