import { createServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addDays,
  answerFaq,
  describeSearch,
  mergeContext,
  parseIntentFallback,
  weatherAdvice,
  type ChatContext,
  type Intent,
} from "./assistant";
import { forecastFor, modelIntent } from "./assistant.server";
import { moroccoInstant } from "./route-adapter";
import { geocodeFirst, searchRides } from "./routing.server";
import { clockTime, coordinate, isoDate } from "./schemas";

const MESSAGES_PER_HOUR = 15;
const HELP =
  "Je n’ai pas bien compris. Je peux chercher un trajet (« un trajet demain 7h30 depuis Malabata »), vous dire s’il va pleuvoir, donner les prix, expliquer la sécurité ou lister vos réservations. Pour le reste, utilisez les écrans de l’application.";

export const askRafiq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      message: z.string().trim().min(1).max(500),
      context: z.object({
        date: isoDate.nullable(),
        arrival: clockTime.nullable(),
        originText: z.string().max(120).nullable(),
      }),
    }),
  )
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await context.supabase
      .from("ai_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("role", "user")
      .gte("created_at", since);
    if ((count ?? 0) >= MESSAGES_PER_HOUR)
      return {
        ok: false as const,
        error: `Limite de ${MESSAGES_PER_HOUR} messages par heure atteinte. Réessayez plus tard ou utilisez la recherche classique.`,
      };
    await context.supabase
      .from("ai_messages")
      .insert({ user_id: context.userId, role: "user", content: data.message });

    const today = formatInTimeZone(new Date(), "Africa/Casablanca", "yyyy-MM-dd");
    let mode: "model" | "simple" = "model";
    let intent: Intent | null = null;
    try {
      intent = await modelIntent(data.message, today);
    } catch {
      intent = null;
    }
    if (!intent) {
      mode = "simple";
      intent = parseIntentFallback(data.message, today);
    }
    const wanted = mergeContext(intent, data.context);

    let text = HELP;
    let offer: {
      tripId: string;
      date: string;
      arrival: string;
      origin: z.infer<typeof coordinate>;
      priceDh: number;
      pickupTime: number;
    } | null = null;
    let next: ChatContext = {
      date: wanted.date,
      arrival: wanted.arrival,
      originText: wanted.originText,
    };

    try {
      if (wanted.kind === "search") {
        if (!wanted.originText) text = "Depuis quel quartier ou quelle adresse partez-vous ?";
        else if (!wanted.arrival) text = "Pour quelle heure d’arrivée souhaitez-vous un trajet ?";
        else {
          const date =
            wanted.date ??
            (moroccoInstant(today, wanted.arrival) > Date.now() ? today : addDays(today, 1));
          next = { date, arrival: wanted.arrival, originText: wanted.originText };
          const origin = await geocodeFirst(wanted.originText);
          if (!origin)
            text = `Je n’ai pas trouvé « ${wanted.originText} » à Tanger. Pouvez-vous préciser l’adresse ?`;
          else {
            // Arrival = the school: no extra address lookup, the drivers' own destination is used.
            const result = await searchRides(context.userId, {
              origin: origin.coordinates,
              destination: null,
              date,
              arrival: wanted.arrival,
            });
            const best = result.matches[0];
            if (result.error) text = result.error;
            else {
              text = `Pour ${format(parseISO(date), "EEEE d MMMM", { locale: fr })} : ${describeSearch(result.matches.length, best ? { pickupTime: best.pickupTime, walkMeters: Math.ceil(best.walkingRoute.distanceMeters), priceDh: best.priceDh } : null, wanted.arrival)}`;
              if (best)
                offer = {
                  tripId: best.tripId,
                  date,
                  arrival: wanted.arrival,
                  origin: origin.coordinates,
                  priceDh: best.priceDh,
                  pickupTime: best.pickupTime,
                };
              else if (result.hint) text += ` ${result.hint}`;
              // "…un trajet demain 7h30 et la météo" : answer both in one go.
              if (/pluie|pleut|pleuv|m[eé]t[eé]o|parapluie/i.test(data.message)) {
                const forecast = await forecastFor(date, wanted.arrival);
                text += `\nMétéo à ${wanted.arrival} : ${weatherAdvice(forecast.probability, forecast.millimetres)}`;
              }
            }
          }
        }
      } else if (wanted.kind === "faq") {
        text = answerFaq(wanted.topic ?? "how");
      } else if (wanted.kind === "bookings") {
        const { data: mine } = await context.supabase
          .from("bookings")
          .select("travel_date, pickup_eta, price_dh, status, trips(origin_label, dest_label)")
          .eq("passenger_id", context.userId)
          .in("status", ["confirmed", "in_progress"])
          .gte("travel_date", today)
          .order("travel_date")
          .limit(3);
        const { count: published } = await context.supabase
          .from("trips")
          .select("id", { count: "exact", head: true })
          .eq("driver_id", context.userId)
          .eq("active", true);
        const lines = (mine ?? []).map(
          (item) =>
            `• ${format(parseISO(item.travel_date), "EEEE d MMMM", { locale: fr })} à ${(item.pickup_eta ?? "").slice(0, 5)} : ${(item.trips?.origin_label ?? "").split(",")[0]} → ${(item.trips?.dest_label ?? "").split(",")[0]} (${item.price_dh} DH)`,
        );
        text = lines.length
          ? `Vos prochaines réservations :\n${lines.join("\n")}`
          : "Vous n’avez aucune réservation à venir.";
        if (published)
          text += `\nVous avez ${published} trajet${published > 1 ? "s" : ""} publié${published > 1 ? "s" : ""} en tant que conducteur.`;
        text += " Tout est dans « Mes trajets ».";
      } else if (wanted.kind === "weather") {
        if (!wanted.date || !wanted.arrival)
          text =
            "Pour quel jour et quelle heure voulez-vous la météo ? Par exemple : « demain 7h30 ».";
        else {
          const forecast = await forecastFor(wanted.date, wanted.arrival);
          text = `Prévision pour le ${wanted.date} à ${wanted.arrival} : ${weatherAdvice(forecast.probability, forecast.millimetres)}`;
        }
      }
    } catch (error) {
      console.error("askRafiq failed", error);
      text =
        "Je n’ai pas pu terminer cette recherche pour le moment. Réessayez dans un instant ou utilisez la recherche classique.";
    }

    await context.supabase
      .from("ai_messages")
      .insert({ user_id: context.userId, role: "assistant", content: text });
    return { ok: true as const, text, offer, context: next, mode };
  });
