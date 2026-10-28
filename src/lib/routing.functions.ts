import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { shortAddress } from "./address";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { clockTime, coordinate, isoDate } from "./schemas";
import { headers, pause, searchRides } from "./routing.server";

export const searchAddress = createServerFn({ method: "POST" })
  .inputValidator(z.object({ query: z.string().trim().min(2).max(180) }))
  .handler(async ({ data }) => {
    try {
      // Photon supports prefix (type-ahead) search, so "mes" already proposes "Mesnana…".
      const typed = data.query.trim().toLowerCase();
      try {
        const photon = new URLSearchParams({
          q: data.query,
          limit: "10",
          lat: "35.76",
          lon: "-5.83",
          bbox: "-6.05,35.6,-5.6,35.85",
        });
        const response = await fetch(`https://photon.komoot.io/api/?${photon}`, {
          headers,
          signal: AbortSignal.timeout(6000),
        });
        if (response.ok) {
          const parsed = z
            .object({
              features: z.array(
                z.object({
                  geometry: z.object({ coordinates: coordinate }),
                  properties: z.record(z.string(), z.unknown()),
                }),
              ),
            })
            .parse(await response.json());
          const seen = new Set<string>();
          const found = parsed.features.flatMap((feature) => {
            const p = feature.properties as Record<string, string | undefined>;
            const name = p["name"] ?? p["street"];
            if (!name) return [];
            const area = [p["locality"], p["district"], p["street"]].find(
              (value) => value && value !== name,
            );
            const label = shortAddress(area ? `${name}, ${area}` : name);
            if (seen.has(label)) return [];
            seen.add(label);
            return [{ label, coordinates: feature.geometry.coordinates }];
          });
          const starts = found.filter((place) => place.label.toLowerCase().startsWith(typed));
          const rest = found.filter((place) => !place.label.toLowerCase().startsWith(typed));
          const places = [...starts, ...rest].slice(0, 6);
          if (places.length) return { places, error: null };
        }
      } catch {
        /* fall back to Nominatim below */
      }
      await pause();
      const params = new URLSearchParams({
        q: `${data.query}, Tanger, Maroc`,
        format: "jsonv2",
        limit: "8",
        countrycodes: "ma",
        viewbox: "-6.05,35.88,-5.65,35.65",
        bounded: "1",
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
        places: places
          .map((place) => ({
            label: shortAddress(place.display_name),
            coordinates: coordinate.parse([Number(place.lon), Number(place.lat)]),
          }))
          .filter((place, index, all) => all.findIndex((p) => p.label === place.label) === index)
          .slice(0, 5),
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
