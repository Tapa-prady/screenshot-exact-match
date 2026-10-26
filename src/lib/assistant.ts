import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";

/** Pure, browser-safe parts of the Rafiq IA assistant. The model never acts: it only fills this structure. */

export type IntentKind = "search" | "weather" | "unknown";
export interface Intent {
  kind: IntentKind;
  originText: string | null;
  date: string | null;
  arrival: string | null;
}
export interface ChatContext {
  date: string | null;
  arrival: string | null;
  originText: string | null;
}

/** Shape the language model must return; everything is validated again on the server. */
export const modelIntentSchema = z.object({
  kind: z.enum(["search", "weather", "unknown"]),
  origin_text: z.string().trim().max(120).nullable(),
  date_relative: z.enum(["today", "tomorrow", "day_after_tomorrow", "none"]),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  arrival: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
});

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function intentFromModel(raw: unknown, today: string): Intent | null {
  const parsed = modelIntentSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { kind, origin_text, date_relative, date, arrival } = parsed.data;
  const offset = { today: 0, tomorrow: 1, day_after_tomorrow: 2, none: null }[date_relative];
  return {
    kind,
    originText: origin_text || null,
    date: date ?? (offset === null ? null : addDays(today, offset)),
    arrival,
  };
}

/** Works without any model: used when no API key is configured or the model is unavailable. */
export function parseIntentFallback(text: string, today: string): Intent {
  const clean = text.trim().slice(0, 500);
  const origin =
    /(?:depuis|départ de|depart de|partant de)\s+(?:chez\s+)?(.+?)(?=\s+(?:demain|aujourd|après|apres|pour|vers|avant|ce\s)|[,.?!;]|\s+à\s+\d|\s+a\s+\d|$)/i
      .exec(clean)?.[1]
      ?.trim() ?? null;
  const time = /\b([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)?(?!\d)/i.exec(clean);
  const arrival = time ? `${time[1]!.padStart(2, "0")}:${time[2] ?? "00"}` : null;
  let date: string | null = null;
  if (/apr[èe]s[-\s]?demain/i.test(clean)) date = addDays(today, 2);
  else if (/demain/i.test(clean)) date = addDays(today, 1);
  else if (/aujourd['’]?hui|ce matin|ce soir/i.test(clean)) date = today;
  const wantsSearch = origin !== null || /cherche|trouve|trajet|covoit|réserv|reserv/i.test(clean);
  const wantsWeather = /pluie|pleut|pleuv|météo|meteo|parapluie/i.test(clean);
  return {
    kind:
      wantsSearch && !(wantsWeather && !origin) ? "search" : wantsWeather ? "weather" : "unknown",
    originText: origin,
    date,
    arrival,
  };
}

export function mergeContext(intent: Intent, context: ChatContext): Intent {
  return {
    ...intent,
    originText: intent.originText ?? context.originText,
    date: intent.date ?? context.date,
    arrival: intent.arrival ?? context.arrival,
  };
}

export function weatherAdvice(probability: number | null, millimetres: number | null): string {
  if (probability === null) return "Je n’ai pas pu consulter la météo pour le moment.";
  const rounded = Math.round(probability);
  if (rounded >= 60 || (millimetres ?? 0) >= 1)
    return `Pluie probable (${rounded} %). Prévoyez de partir 10 minutes plus tôt et prenez un parapluie.`;
  if (rounded >= 30) return `Quelques risques d’averses (${rounded} %). Un parapluie peut servir.`;
  return `Pas de pluie annoncée (${rounded} %).`;
}

export interface BestMatch {
  pickupTime: number;
  walkMeters: number;
  priceDh: number;
}

export function describeSearch(count: number, best: BestMatch | null, arrival: string): string {
  if (count === 0 || !best)
    return `Je n’ai trouvé aucun trajet avec un rendez-vous à 200 m maximum pour une arrivée avant ${arrival}. Essayez une autre heure ou publiez votre demande plus tôt.`;
  const time = formatInTimeZone(best.pickupTime, "Africa/Casablanca", "HH:mm");
  const plural = count > 1 ? `${count} trajets` : "1 trajet";
  return `J’ai trouvé ${plural} pour arriver avant ${arrival}. Le plus proche : rendez-vous à ${time}, ${best.walkMeters} m à pied, ${best.priceDh} DH.`;
}
