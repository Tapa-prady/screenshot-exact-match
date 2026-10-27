import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { shortAddress } from "./address";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { clockTime, coordinate, isoDate } from "./schemas";
import { headers, pause, searchRides } from "./routing.server";

export const searchAddress = createServerFn({ method: "POST" })
  .inputValidator(z.object({ query: z.string().trim().min(3).max(180) }))
  .handler(async ({ data }) => {
    try {
      await pause();
      const params = new URLSearchParams({
        q: `${data.query}, Tanger, Maroc`,
        format: "jsonv2",
        limit: "4",
        countrycodes: "ma",
      });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers,
        signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error("Geocoding unavailable");
      const places = z
        .array(z.object({ display_name: z.string(), lat: z.string(), lon: z.string() }))
        .parse(await response.json());
      return {
        places: places.map((place) => ({
          label: shortAddress(place.display_name),
          coordinates: coordinate.parse([Number(place.lon), Number(place.lat)]),
        })),
        error: null,
      };
    } catch {
      return {
        places: [],
        error: "La recherche d’adresse est indisponible. Vous pouvez utiliser votre position GPS.",
      };
    }
  });

export const searchRealRides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ origin: coordinate, destination: coordinate, date: isoDate, arrival: clockTime }),
  )
  .handler(async ({ data, context }) => searchRides(context.userId, data));
