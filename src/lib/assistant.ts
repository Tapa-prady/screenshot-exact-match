import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { calculateRidePrice } from "./ride-pricing";

/** Pure, browser-safe parts of the Rafiq IA assistant. The model never acts: it only fills this structure. */

export type IntentKind = "search" | "weather" | "faq" | "bookings" | "unknown";
export const TOPICS = [
  "price",
  "publish",
  "book",
  "cancel",
  "safety",
  "how",
  "drivers",
  "greeting",
  "thanks",
] as const;
export type Topic = (typeof TOPICS)[number];
export interface Intent {
  kind: IntentKind;
  originText: string | null;
  date: string | null;
  arrival: string | null;
  /** Only for `faq`: which fixed answer to give. The model never writes the answer itself. */
  topic?: Topic | undefined;
}
export interface ChatContext {
  date: string | null;
  arrival: string | null;
  originText: string | null;
}

/** Shape the language model must return; everything is validated again on the server. */
export const modelIntentSchema = z.object({
  kind: z.enum(["search", "weather", "faq", "bookings", "unknown"]),
  topic: z.enum(TOPICS).nullable().optional(),
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
  const { kind, origin_text, date_relative, date, arrival, topic } = parsed.data;
  const offset = { today: 0, tomorrow: 1, day_after_tomorrow: 2, none: null }[date_relative];
  return {
    kind,
    originText: origin_text || null,
    date: date ?? (offset === null ? null : addDays(today, offset)),
    arrival,
    ...(kind === "faq" ? { topic: topic ?? "how" } : {}),
  };
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Next date (1 to 7 days ahead) falling on the named weekday. */
function nextWeekday(today: string, name: string): string {
  const target = WEEKDAYS.indexOf(name);
  const current = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, ((target - current + 6) % 7) + 1);
}

const END = String.raw`(?=\s+(?:demain|aujourd|apr[eè]s|pour|vers|avant|ce\s|cet\s|[aà]\s|jusqu|et\s|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|svp|stp)|[,.?!;]|\s+\d|$)`;
const ORIGIN_PATTERNS = [
  new RegExp(
    String.raw`(?:depuis|d[ée]part de|d[ée]part du|partant de)\s+(?:chez\s+)?(.+?)${END}`,
    "i",
  ),
  new RegExp(
    String.raw`je\s+(?:pars|part|partirai|vais\s+partir)\s+(?:de|du|des|d['’])\s*(?:chez\s+)?(.+?)${END}`,
    "i",
  ),
  new RegExp(
    String.raw`je\s+(?:suis|serai|habite|reste|me\s+trouve)\s+(?:[aà]|au|aux|chez|pr[eè]s\s+de|vers)\s+(.+?)${END}`,
    "i",
  ),
  /\bde\s+(.+?)\s+(?:[aà]|vers|jusqu['’][aà]|pour)\s+l['’]?\s*(?:ensa|[eé]cole|fac\b|campus)/i,
];

function faqTopic(text: string): Topic | null {
  if (/^\s*(?:salut|bonjour|bonsoir|coucou|hello|hey|salam|slt)\b/i.test(text) && text.length < 40)
    return "greeting";
  if (/\bmerci\b|\bthanks?\b/i.test(text)) return "thanks";
  if (/annul/i.test(text)) return "cancel";
  if (/prix|co[uû]te?|combien|tarif|\bpayer\b|paiement/i.test(text)) return "price";
  if (
    /non[-\s]?[eé]tudiant|conducteur[^.?!]*[eé]tudiant|conducteur externe|qui peut|n['’]est pas [eé]tudiant/i.test(
      text,
    )
  )
    return "drivers";
  if (
    /\bsos\b|s[eé]curit|danger|urgence|proches?|confiance|partager (?:ma )?position|suivi/i.test(
      text,
    )
  )
    return "safety";
  if (
    /publier|proposer|offrir|\bconduire\b|je conduis|devenir conducteur|mettre (?:ma|mes) (?:voiture|places?)/i.test(
      text,
    )
  )
    return "publish";
  if (
    /comment\s+(?:je\s+)?(?:peux\s+)?r[eé]serv|r[eé]server comment|comment\s+(?:je\s+)?(?:trouve|cherche)/i.test(
      text,
    )
  )
    return "book";
  if (
    /comment\s+[cç]a\s+march|comment\s+[cç]a\s+fonctionne|c['’]est quoi|qu['’]est[-\s]ce que|\baide\b|\bhelp\b|que (?:sais|peux)[-\s]tu|tu (?:peux|sais) faire|tu fais quoi|[aà] quoi (?:tu )?sers?/i.test(
      text,
    )
  )
    return "how";
  return null;
}

/** Works without any model: used when no API key is configured or the model is unavailable. */
export function parseIntentFallback(text: string, today: string): Intent {
  const clean = text.trim().slice(0, 500);
  let origin: string | null = null;
  for (const pattern of ORIGIN_PATTERNS) {
    const found = pattern
      .exec(clean)?.[1]
      ?.trim()
      .replace(/^(?:l['’]|la |le |les )/i, (m) => m);
    if (found && found.length >= 2) {
      origin = found;
      break;
    }
  }
  const time = /\b([01]?\d|2[0-3])\s*(?:h|:|heures?)\s*([0-5]\d)?(?!\d)/i.exec(clean);
  const arrival = time ? `${time[1]!.padStart(2, "0")}:${time[2] ?? "00"}` : null;
  let date: string | null = null;
  const weekday = WEEKDAYS.find((name) => new RegExp(`\\b${name}\\b`, "i").test(clean));
  if (/apr[èe]s[-\s]?demain/i.test(clean)) date = addDays(today, 2);
  else if (/demain/i.test(clean)) date = addDays(today, 1);
  else if (/aujourd['’]?hui|ce matin|ce soir|cet apr[eè]s/i.test(clean)) date = today;
  else if (weekday) date = nextWeekday(today, weekday);
  const wantsWeather = /pluie|pleut|pleuv|météo|meteo|parapluie/i.test(clean);
  const base = { originText: origin, date, arrival };
  if (
    /mes r[eé]servations?|ma r[eé]servation|mes trajets|mon prochain trajet|prochain trajet|j['’]ai r[eé]serv[eé]/i.test(
      clean,
    ) &&
    !origin &&
    !/annul|comment/i.test(clean)
  )
    return { kind: "bookings", ...base };
  if (origin) return { kind: wantsWeather && !arrival ? "weather" : "search", ...base };
  const topic = faqTopic(clean);
  if (topic) return { kind: "faq", topic, ...base };
  if (
    /cherche|trouve|trajet|covoit|r[eé]serv|besoin d['’]aller|aller [aà] l['’]ensa|arriver/i.test(
      clean,
    ) &&
    !wantsWeather
  )
    return { kind: "search", ...base };
  return { kind: wantsWeather ? "weather" : "unknown", ...base };
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

/** Fixed, reviewed answers: the assistant never invents rules, prices or safety advice. */
export function answerFaq(topic: Topic): string {
  const price = (km: number) => `${calculateRidePrice(km)} DH`;
  switch (topic) {
    case "price":
      return `Le prix partage les frais d’essence et dépend de votre distance en voiture : 2 DH/km sur les 5 premiers km, 1 DH/km de 5 à 10 km, 0,5 DH/km au-delà, avec un minimum de 5 DH et un maximum de 20 DH. Par exemple : 5 km → ${price(5)}, 10 km → ${price(10)}, 20 km → ${price(20)}. Le prix exact s’affiche avant de réserver.`;
    case "publish":
      return "Pour proposer un trajet, touchez « Je suis conducteur » sur l’accueil (ou « Publier un trajet » dans le menu). Indiquez le départ, l’arrivée, l’heure, les jours, le nombre de places et votre véhicule. Votre compte doit être en mode Conducteur ; les conducteurs n’ont pas besoin d’être étudiants.";
    case "book":
      return "Pour réserver : indiquez votre position, l’arrivée (ENSA) et l’heure à laquelle vous devez arriver, puis touchez « Trouver un trajet ». Le rendez-vous est toujours à 200 m maximum de vous. Vous pouvez aussi me dire ici : « un trajet demain 7h30 depuis Malabata ». La réservation est réservée aux étudiants avec une adresse @etu.uae.ac.ma.";
    case "cancel":
      return "Allez dans « Mes trajets » et touchez « Annuler » sous votre réservation. Un conducteur peut aussi mettre un trajet publié en pause depuis la même page.";
    case "safety":
      return "Sur l’écran du trajet, vous pouvez partager votre position en direct (seulement avec l’autre personne du trajet, et seulement si vous le décidez), prévenir vos proches de confiance par SMS ou WhatsApp, et utiliser le bouton SOS qui enregistre une alerte et affiche les numéros 19, 177 et 15. Rafiq n’envoie pas de message à votre place. Ajoutez vos proches dans « Mes trajets ».";
    case "drivers":
      return "À la création du compte, vous choisissez Étudiant (chercher et réserver) ou Conducteur (publier des trajets). Avec une adresse @etu.uae.ac.ma, vous pouvez choisir l’un ou l’autre et changer ensuite depuis « Mes trajets ». Avec toute autre adresse e-mail, le compte est Conducteur uniquement.";
    case "how":
      return "Rafiq met en relation des étudiants de l’ENSA Tanger et des conducteurs. Le conducteur publie son itinéraire ; vous indiquez où vous êtes et l’heure d’arrivée, et Rafiq trouve un rendez-vous sur son chemin, à 200 m maximum de vous. Je peux chercher un trajet, vous dire s’il va pleuvoir, expliquer les prix et la sécurité, ou lister vos réservations.";
    case "thanks":
      return "Avec plaisir ! Bon trajet.";
    case "greeting":
      return "Bonjour ! Dites-moi d’où vous partez et à quelle heure vous devez arriver, par exemple « un trajet demain 7h30 depuis Malabata ». Je peux aussi vous donner les prix, la météo ou vos réservations.";
  }
}
