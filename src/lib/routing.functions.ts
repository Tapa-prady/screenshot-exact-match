import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findRideMatches, type DriverRoute, type RideMatch } from "./ride-matching";
import { moroccoInstant, tripRunsOnDate } from "./route-adapter";
import { clockTime, coordinate, isoDate } from "./schemas";
import { headers, pause, verifiedGeometry, walkingResolver } from "./routing.server";

export const searchAddress = createServerFn({ method: "POST" })
  .inputValidator(z.object({ query: z.string().trim().min(3).max(180) }))
  .handler(async ({ data }) => {
    try {
      await pause();
      const params = new URLSearchParams({ q: `${data.query}, Tanger, Maroc`, format: "jsonv2", limit: "4", countrycodes: "ma" });
      const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers, signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error("Geocoding unavailable");
      const places = z.array(z.object({ display_name: z.string(), lat: z.string(), lon: z.string() })).parse(await response.json());
      return { places: places.map(place => ({ label: place.display_name, coordinates: coordinate.parse([Number(place.lon), Number(place.lat)]) })), error: null };
    } catch {
      return { places: [], error: "La recherche d’adresse est indisponible. Vous pouvez utiliser votre position GPS." };
    }
  });

export const searchRealRides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ origin: coordinate, destination: coordinate, date: isoDate, arrival: clockTime }))
  .handler(async ({ data, context }) => {
    const empty = { matches: [], routes: [], error: null as string | null, unavailableCount: 0 };
    try {
      const deadline = moroccoInstant(data.date, data.arrival);
      if (deadline <= Date.now()) return { ...empty, error: "Choisissez une heure d’arrivée future." };
      const { data: trips, error } = await context.supabase.from("trips").select("*").eq("active", true).limit(50);
      if (error) throw error;
      const candidates = (trips ?? []).filter(trip => tripRunsOnDate(trip, data.date)
        && trip.driver_id !== context.userId
        && Math.abs(trip.dest_lat - data.destination[1]) < 0.001
        && Math.abs(trip.dest_lng - data.destination[0]) < 0.001).slice(0, 8);
      if (candidates.length === 0) return empty;
      const routes: DriverRoute[] = [];
      let unavailableCount = 0;
      for (const trip of candidates) {
        try {
          const geometry = await verifiedGeometry(trip);
          if (!geometry) { unavailableCount++; continue; }
          const { data: profile } = await context.supabase.from("profiles").select("rating_avg").eq("id", trip.driver_id).maybeSingle();
          // Capacity is rechecked by the booking trigger. Other passengers' rows are not publicly exposed.
          routes.push({ id: trip.id, ...geometry, departureTime: moroccoInstant(data.date, trip.departure_time), seatsAvailable: trip.seats, rating: profile?.rating_avg ?? 0 });
        } catch { unavailableCount++; }
      }
      const matches: RideMatch[] = [];
      // One route at a time respects community pedestrian routing's request interval.
      for (const route of routes) {
        const found = await findRideMatches({ passengerPosition: data.origin, desiredArrivalTime: deadline, earliestPickupTime: Date.now(), routes: [route], resolveWalkingRoute: walkingResolver(() => { unavailableCount++; }) });
        matches.push(...found);
      }
      matches.sort((a, b) => a.walkingRoute.durationSeconds - b.walkingRoute.durationSeconds || a.arrivalTime - b.arrivalTime || b.rating - a.rating);
      return { matches, routes: routes.filter(route => matches.some(match => match.tripId === route.id)).map(route => ({ id: route.id, coordinates: route.coordinates })), error: null, unavailableCount };
    } catch {
      return { ...empty, error: "Les trajets ne sont pas accessibles pour le moment. Réessayez plus tard." };
    }
  });
