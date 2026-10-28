import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { findRideMatches, type Coordinates, type DriverRoute, type RideMatch } from "./ride-matching";
import { legacyRouteCoordinates, moroccoInstant, tripRunsOnDate } from "./route-adapter";

const coordinate = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const pause = () => new Promise(resolve => setTimeout(resolve, 1100));
const headers = { "User-Agent": "Rafiq-ENSA-Tanger/1.0 (student carpool prototype)", Accept: "application/json" };

const osrmSchema = z.object({
  code: z.literal("Ok"),
  waypoints: z.array(z.object({ location: coordinate, distance: z.number() })),
  routes: z.array(z.object({
    distance: z.number(), duration: z.number(),
    geometry: z.object({ coordinates: z.array(coordinate) }),
    legs: z.array(z.object({ annotation: z.object({ distance: z.array(z.number()), duration: z.array(z.number()) }).optional() })),
  })),
});

async function routeRequest(kind: "car" | "foot", from: Coordinates, to: Coordinates) {
  await pause();
  const base = kind === "foot" ? "https://routing.openstreetmap.de/routed-foot" : "https://router.project-osrm.org";
  const response = await fetch(`${base}/route/v1/driving/${from.join(",")};${to.join(",")}?overview=full&geometries=geojson&annotations=distance,duration&steps=false`, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Routing unavailable");
  const parsed = osrmSchema.parse(await response.json());
  const route = parsed.routes[0];
  if (!route) throw new Error("No route");
  return { route, waypoints: parsed.waypoints };
}

export const searchAddress = createServerFn({ method: "POST" })
  .inputValidator(z.object({ query: z.string().trim().min(2).max(180) }))
  .handler(async ({ data }) => {
    try {
      // Photon supports prefix (type-ahead) search; biased and bounded to greater Tanger.
      const params = new URLSearchParams({ q: data.query, limit: "8", lat: "35.76", lon: "-5.83", bbox: "-6.05,35.6,-5.6,35.85" });
      const response = await fetch(`https://photon.komoot.io/api/?${params}`, { headers, signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Geocoding unavailable");
      const parsed = z.object({ features: z.array(z.object({ geometry: z.object({ coordinates: coordinate }), properties: z.record(z.string(), z.unknown()) })) }).parse(await response.json());
      const seen = new Set<string>();
      const places = parsed.features.flatMap(feature => {
        const p = feature.properties as Record<string, string | undefined>;
        const name = p.name ?? p.street;
        if (!name) return [];
        const area = [p.locality, p.street].find(value => value && value !== name);
        const label = area ? `${name}, ${area}` : name;
        if (seen.has(label)) return [];
        seen.add(label);
        return [{ label, coordinates: feature.geometry.coordinates }];
      }).slice(0, 6);
      return { places, error: null };
    } catch {
      return { places: [], error: "La recherche d’adresse est indisponible. Vous pouvez utiliser votre position GPS." };
    }
  });

export const searchRealRides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ origin: coordinate, destination: coordinate, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), arrival: z.string().regex(/^\d{2}:\d{2}$/) }))
  .handler(async ({ data, context }) => {
    const empty = { matches: [], routes: [], error: null as string | null, unavailableCount: 0 };
    try {
      const deadline = moroccoInstant(data.date, data.arrival);
      if (deadline <= Date.now()) return { ...empty, error: "Choisissez une heure d’arrivée future." };
      const { data: trips, error } = await context.supabase.from("trips").select("*").eq("active", true).limit(50);
      if (error) throw error;
      const candidates = (trips ?? []).filter(trip => tripRunsOnDate(trip, data.date)
        && Math.abs(trip.dest_lat - data.destination[1]) < 0.001
        && Math.abs(trip.dest_lng - data.destination[0]) < 0.001).slice(0, 8);
      if (candidates.length === 0) return empty;
      const routes: DriverRoute[] = [];
      let unavailableCount = 0;
      for (const trip of candidates) {
        try {
          const coordinates = legacyRouteCoordinates(trip.route);
          // Resolve segment metrics only when the provider returns exactly the persisted geometry.
          // Never replace a published driver's path with a newly guessed path.
          const { route } = await routeRequest("car", [trip.origin_lng, trip.origin_lat], [trip.dest_lng, trip.dest_lat]);
          if (coordinates.length !== route.geometry.coordinates.length || coordinates.some((value, index) => {
            const other = route.geometry.coordinates[index];
            return !other || Math.abs(value[0] - other[0]) > 0.00001 || Math.abs(value[1] - other[1]) > 0.00001;
          })) { unavailableCount++; continue; }
          const annotation = route.legs[0]?.annotation;
          if (!annotation || annotation.distance.length !== coordinates.length - 1 || annotation.duration.length !== coordinates.length - 1) { unavailableCount++; continue; }
          const cumulative = (values: number[]) => { let total = 0; return [0, ...values.map(value => (total += value))]; };
          const { data: profile } = await context.supabase.from("profiles").select("rating_avg").eq("id", trip.driver_id).maybeSingle();
          // Capacity is rechecked by the booking trigger. Other passengers' rows are not publicly exposed.
          routes.push({ id: trip.id, coordinates, distanceMeters: cumulative(annotation.distance), elapsedSeconds: cumulative(annotation.duration), departureTime: moroccoInstant(data.date, trip.departure_time), seatsAvailable: trip.seats, rating: profile?.rating_avg ?? 0 });
        } catch { unavailableCount++; }
      }
      const matches: RideMatch[] = [];
      // One route at a time respects community pedestrian routing's request interval.
      for (const route of routes) {
        const found = await findRideMatches({ passengerPosition: data.origin, desiredArrivalTime: deadline, earliestPickupTime: Date.now(), routes: [route], resolveWalkingRoute: async (from, to) => {
          try {
            const result = await routeRequest("foot", from, to);
            const startSnap = result.waypoints[0]?.distance ?? Infinity;
            const endSnap = result.waypoints[1]?.distance ?? Infinity;
            // Reject snapped paths that do not reach the actual pickup; never claim a partial path is walkable.
            if (startSnap > 5 || endSnap > 5) return null;
            const extra = startSnap + endSnap;
            return { coordinates: result.route.geometry.coordinates, distanceMeters: result.route.distance + extra, durationSeconds: result.route.duration + extra / 1.2 };
          } catch { unavailableCount++; return null; }
        } });
        matches.push(...found);
      }
      matches.sort((a, b) => a.walkingRoute.durationSeconds - b.walkingRoute.durationSeconds || a.arrivalTime - b.arrivalTime || b.rating - a.rating);
      return { matches, routes: routes.filter(route => matches.some(match => match.tripId === route.id)).map(route => ({ id: route.id, coordinates: route.coordinates })), error: null, unavailableCount };
    } catch {
      return { ...empty, error: "Les trajets ne sont pas accessibles pour le moment. Réessayez plus tard." };
    }
  });
const place = z.object({ label: z.string().trim().min(1).max(300), coordinates: coordinate });
export const publishTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    origin: place, destination: place,
    departureTime: z.string().regex(/^\d{2}:\d{2}$/),
    oneOffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7),
    seats: z.number().int().min(1).max(6),
    vehicle: z.object({ brand: z.string().trim().min(1).max(60), color: z.string().trim().min(1).max(30), plate: z.string().trim().min(2).max(20) }),
  }))
  .handler(async ({ data, context }) => {
    if (!data.oneOffDate && data.weekdays.length === 0) return { error: "Choisissez une date ou au moins un jour de la semaine." };
    let route;
    try { ({ route } = await routeRequest("car", data.origin.coordinates, data.destination.coordinates)); }
    catch { return { error: "L’itinéraire n’a pas pu être calculé. Réessayez dans un instant." }; }
    const { data: existing } = await context.supabase.from("vehicles").select("id").eq("owner_id", context.userId).eq("plate", data.vehicle.plate).maybeSingle();
    let vehicleId = existing?.id;
    if (!vehicleId) {
      const { data: created, error } = await context.supabase.from("vehicles").insert({ owner_id: context.userId, ...data.vehicle, seats: data.seats }).select("id").single();
      if (error) return { error: "Le véhicule n’a pas pu être enregistré." };
      vehicleId = created.id;
    }
    const { error } = await context.supabase.from("trips").insert({
      driver_id: context.userId, vehicle_id: vehicleId,
      origin_label: data.origin.label, origin_lng: data.origin.coordinates[0], origin_lat: data.origin.coordinates[1],
      dest_label: data.destination.label, dest_lng: data.destination.coordinates[0], dest_lat: data.destination.coordinates[1],
      departure_time: data.departureTime, one_off_date: data.oneOffDate, weekdays: data.oneOffDate ? [] : data.weekdays, seats: data.seats,
      route: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      route_km: Math.round(route.distance / 100) / 10, route_minutes: Math.round(route.duration / 60),
    });
    if (error) return { error: "Le trajet n’a pas pu être publié." };
    return { error: null, km: Math.round(route.distance / 100) / 10, minutes: Math.round(route.duration / 60) };
  });
