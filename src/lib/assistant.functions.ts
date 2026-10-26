import { createServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  addDays,
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
  "Je peux chercher un trajet (« un trajet demain 7h30 depuis Malabata ») ou vous dire s’il va pleuvoir (« et s’il pleut ? »).";

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
          const [origin, destination] = [
            await geocodeFirst(wanted.originText),
            await geocodeFirst("ENSA Tanger"),
          ];
          if (!origin)
            text = `Je n’ai pas trouvé « ${wanted.originText} » à Tanger. Pouvez-vous préciser l’adresse ?`;
          else if (!destination)
            text =
              "L’adresse de l’école n’a pas pu être trouvée pour le moment. Réessayez dans un instant.";
          else {
            const result = await searchRides(context.supabase, context.userId, {
              origin: origin.coordinates,
              destination: destination.coordinates,
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
            }
          }
        }
      } else if (wanted.kind === "weather") {
        if (!wanted.date || !wanted.arrival)
          text =
            "Pour quel jour et quelle heure voulez-vous la météo ? Par exemple : « demain 7h30 ».";
        else {
          const forecast = await forecastFor(wanted.date, wanted.arrival);
          text = `Prévision pour le ${wanted.date} à ${wanted.arrival} : ${weatherAdvice(forecast.probability, forecast.millimetres)}`;
        }
      }
    } catch {
      text =
        "Je n’ai pas pu terminer cette recherche pour le moment. Réessayez dans un instant ou utilisez la recherche classique.";
    }

    await context.supabase
      .from("ai_messages")
      .insert({ user_id: context.userId, role: "assistant", content: text });
    return { ok: true as const, text, offer, context: next, mode };
  });
